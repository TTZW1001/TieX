/**
 * Agent Runtime - Agent 主循环
 * 支持权限审批流程：工具需要审批时进入 waiting_permission 状态
 */
import { randomUUID } from 'crypto'
import type { ModelRequest, ModelStreamEvent } from '../providers/model-provider'
import type {
  ModelToolCall,
  ToolExecutionResult,
  ToolExecutionContext,
} from '../tools/agent-tool.types'
import type { PermissionMode, TaskStatus } from '../../shared/types'
import { taskController, type RuntimeContext, type TaskLimits } from './task-controller'
import { buildContext, toApiMessages, type ContextMessage } from './context-builder'
import { StreamAccumulator } from './response-parser'
import { DEFAULT_TASK_LIMITS, checkWithinLimits, TaskLimitExceededError } from './task-limits'
import { executeToolCall, checkToolPermission, createPermissionRequest } from '../tools/tool-executor'
import { getProvider } from '../providers/provider-factory'
import { MessageRepository } from '../database/repositories/message.repository'
import { TaskStepRepository } from '../database/repositories/task-step.repository'
import { OperationLogRepository } from '../database/repositories/operation-log.repository'
import { taskEventBus } from '../shared/event-bus'
import type { CreateTaskRequest } from '../../shared/types'

const messageRepo = new MessageRepository()
const taskStepRepo = new TaskStepRepository()
const operationLogRepo = new OperationLogRepository()

/** 启动 Agent 任务输入 */
export interface StartAgentTaskInput {
  taskId: string
  conversationId: string
  userMessageId: string
  providerId: string
  workspaceId?: string | null
  permissionMode: PermissionMode
}

/** 权限审批超时时间（毫秒） */
const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000 // 5 分钟

/**
 * 等待权限审批的 Promise 解析器
 */
const permissionResolvers = new Map<string, {
  taskId: string
  resolve: (approved: boolean) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}>()

/**
 * 注册权限审批等待器（含超时自动清理）
 */
export function registerPermissionResolver(requestId: string, taskId: string): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const timer = setTimeout(() => {
      // 超时自动拒绝
      if (permissionResolvers.has(requestId)) {
        permissionResolvers.delete(requestId)
        resolve(false)
      }
    }, PERMISSION_TIMEOUT_MS)

    permissionResolvers.set(requestId, { taskId, resolve, reject, timer })
  })
}

/**
 * 处理权限决策（由 IPC 调用）
 */
export function resolvePermission(requestId: string, approved: boolean): void {
  const resolver = permissionResolvers.get(requestId)
  if (resolver) {
    clearTimeout(resolver.timer)
    resolver.resolve(approved)
    permissionResolvers.delete(requestId)
  }
}

/**
 * 拒绝指定任务的所有待处理权限请求（任务停止时调用）
 */
export function rejectAllPendingPermissions(taskId: string): void {
  for (const [requestId, resolver] of permissionResolvers) {
    if (resolver.taskId === taskId) {
      clearTimeout(resolver.timer)
      resolver.resolve(false)
      permissionResolvers.delete(requestId)
    }
  }
}

/**
 * Agent Runtime 主循环
 */
export async function runAgent(runtime: RuntimeContext): Promise<void> {
  const { taskId, conversationId, abortController } = runtime
  const limits: TaskLimits = { ...DEFAULT_TASK_LIMITS }

  // 标记任务为 running
  taskController.updateTaskStatus(taskId, 'running')
  taskEventBus.emit({ type: 'task:started', taskId })

  // 创建 Assistant 消息占位（用于流式输出）
  const latestMsg = messageRepo.getLatestByConversationId(conversationId)
  const nextSeq = (latestMsg?.sequence_no ?? 0) + 1
  const assistantMessage = messageRepo.create({
    conversation_id: conversationId,
    role: 'assistant',
    content: '',
    content_type: 'markdown',
    sequence_no: nextSeq,
    task_id: taskId,
  })
  messageRepo.setStreaming(assistantMessage.id, 1)

  let pendingToolCalls: Array<{ toolCall: ModelToolCall; result: ToolExecutionResult }> | undefined

  try {
    while (true) {
      // 检查是否被停止
      if (abortController.signal.aborted) {
        await finishTask(runtime, 'stopped', assistantMessage.id, '任务已被用户停止')
        return
      }

      // 检查任务限制
      try {
        checkWithinLimits({
          round: runtime.round,
          toolCallCount: runtime.toolCallCount,
          failureCount: runtime.failureCount,
          limits,
          startedAt: runtime.startedAt,
        })
      } catch (err) {
        if (err instanceof TaskLimitExceededError) {
          await finishTask(runtime, 'failed', assistantMessage.id, err.message, {
            errorCode: err.code,
            errorMessage: err.message,
          })
          return
        }
        throw err
      }

      // 构建上下文
      const { messages, tools } = buildContext({
        taskId,
        conversationId,
        permissionMode: runtime.permissionMode,
        workspaceName: runtime.workspaceName,
        workspaceRootName: runtime.workspaceRootName,
        userContent: runtime.userContent,
        pendingToolCalls,
      })

      // 创建 model_request 步骤
      const seqNo = taskStepRepo.getNextSequenceNo(taskId)
      const modelStep = taskStepRepo.create({
        task_id: taskId,
        sequence_no: seqNo,
        step_type: 'model_request',
        content: `第 ${runtime.round + 1} 轮模型请求`,
      })
      taskStepRepo.updateStatus(modelStep.id, 'running')

      // 构建模型请求
      const modelRequest: ModelRequest = {
        messages: messages as any,
        temperature: runtime.providerConfig.temperature,
        maxTokens: runtime.providerConfig.maxTokens,
        tools: tools.length > 0 ? tools : undefined,
        toolChoice: tools.length > 0 ? 'auto' : undefined,
      }
      modelRequest.config = runtime.providerConfig

      // 调用模型
      const accumulator = new StreamAccumulator()
      let modelError: { code: string; message: string } | null = null

      try {
        const provider = getProvider(runtime.providerConfig.providerType)
        for await (const streamEvent of provider.streamChat(modelRequest, abortController.signal)) {
          if (abortController.signal.aborted) break

          if (streamEvent.type === 'delta') {
            accumulator.processDelta({ content: streamEvent.content })
            // 推送文本 delta 到前端
            const currentText = accumulator.getTextContent()
            taskEventBus.emit({
              type: 'message:delta',
              taskId,
              content: currentText,
              delta: streamEvent.content,
            })
            // 更新 assistant 消息
            messageRepo.updateContent(assistantMessage.id, currentText)
          } else if (streamEvent.type === 'tool_call_delta') {
            accumulator.processDelta({ tool_calls: streamEvent.delta })
          } else if (streamEvent.type === 'finish') {
            accumulator.setFinishReason(streamEvent.reason)
          } else if (streamEvent.type === 'done') {
            break
          } else if (streamEvent.type === 'error') {
            modelError = {
              code: streamEvent.error.code,
              message: streamEvent.error.message,
            }
            break
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError' || abortController.signal.aborted) {
          break
        }
        modelError = {
          code: 'PROVIDER_NETWORK_ERROR',
          message: err.message || '模型请求失败',
        }
      }

      // 如果被中止
      if (abortController.signal.aborted) {
        taskStepRepo.updateStatus(modelStep.id, 'failed')
        await finishTask(runtime, 'stopped', assistantMessage.id, '任务已被用户停止')
        return
      }

      // 如果模型出错
      if (modelError) {
        taskStepRepo.updateStatus(modelStep.id, 'failed')
        runtime.failureCount += 1
        operationLogRepo.create({
          task_id: taskId,
          conversation_id: conversationId,
          log_type: 'model_error',
          level: 'error',
          message: modelError.message,
          details: modelError.code,
        })

        // 推送错误信息到 assistant 消息
        const errorText = `\n\n> 模型请求失败: ${modelError.message}`
        messageRepo.updateContent(assistantMessage.id, (messageRepo.getById(assistantMessage.id)?.content || '') + errorText)

        // 检查失败次数
        if (runtime.failureCount >= limits.maxFailures) {
          await finishTask(runtime, 'failed', assistantMessage.id, `连续失败 ${runtime.failureCount} 次: ${modelError.message}`, {
            errorCode: modelError.code,
            errorMessage: modelError.message,
          })
          return
        }
        continue
      }

      // 解析模型响应
      const modelResponse = accumulator.parseResponse()
      runtime.round += 1
      taskStepRepo.updateStatus(modelStep.id, 'completed')

      // 处理最终文本
      if (modelResponse.type === 'final_text') {
        messageRepo.updateContent(assistantMessage.id, modelResponse.content)
        messageRepo.setStreaming(assistantMessage.id, 0)

        // 创建 text_response 步骤
        const textSeq = taskStepRepo.getNextSequenceNo(taskId)
        const textStep = taskStepRepo.create({
          task_id: taskId,
          sequence_no: textSeq,
          step_type: 'text_response',
          content: modelResponse.content.slice(0, 200),
        })
        taskStepRepo.updateStatus(textStep.id, 'completed')

        operationLogRepo.create({
          task_id: taskId,
          conversation_id: conversationId,
          log_type: 'task_completed',
          message: '任务完成，模型输出最终答复',
        })

        await finishTask(runtime, 'completed', assistantMessage.id)
        return
      }

      // 处理工具调用
      if (modelResponse.type === 'tool_calls' || modelResponse.type === 'tool_calls_with_text') {
        // 如果同时有文本内容，先保存到 assistant 消息
        if (modelResponse.type === 'tool_calls_with_text') {
          messageRepo.updateContent(assistantMessage.id, modelResponse.textContent)
        }

        pendingToolCalls = []

        for (const toolCall of modelResponse.toolCalls) {
          if (abortController.signal.aborted) break

          runtime.toolCallCount += 1
          let persistedToolCallId: string | undefined

          // 检查工具调用限制
          try {
            checkWithinLimits({
              round: runtime.round,
              toolCallCount: runtime.toolCallCount,
              failureCount: runtime.failureCount,
              limits,
              startedAt: runtime.startedAt,
            })
          } catch (err) {
            if (err instanceof TaskLimitExceededError) {
              await finishTask(runtime, 'failed', assistantMessage.id, err.message, {
                errorCode: err.code,
                errorMessage: err.message,
              })
              return
            }
            throw err
          }

          // 检查是否需要权限审批
          const permCheck = checkToolPermission(
            {
              taskId,
              conversationId,
              workspaceRoot: runtime.workspaceRoot,
              permissionMode: runtime.permissionMode,
              signal: abortController.signal,
            },
            toolCall.name,
            toolCall.arguments
          )

          if (permCheck.required) {
            // 需要权限审批
            const toolCallId = randomUUID()
            const requestId = createPermissionRequest(
              {
                taskId,
                conversationId,
                workspaceRoot: runtime.workspaceRoot,
                permissionMode: runtime.permissionMode,
                signal: abortController.signal,
              },
              toolCallId,
              toolCall.name,
              toolCall.arguments,
              permCheck.reason,
              permCheck.riskLevel
            )

            // 更新任务状态为 waiting_permission
            taskController.updateTaskStatus(taskId, 'waiting_permission')

            operationLogRepo.create({
              task_id: taskId,
              conversation_id: conversationId,
              log_type: 'permission',
              level: 'info',
              message: `等待用户审批: ${toolCall.name}`,
              details: `请求ID: ${requestId}`,
            })

            // 等待用户决策
            const approved = await registerPermissionResolver(requestId, taskId)

            // 检查是否被停止
            if (abortController.signal.aborted) {
              await finishTask(runtime, 'stopped', assistantMessage.id, '任务已被用户停止')
              return
            }

            // 恢复任务状态为 running
            taskController.updateTaskStatus(taskId, 'running')

            if (!approved) {
              // 用户拒绝
              operationLogRepo.create({
                task_id: taskId,
                conversation_id: conversationId,
                log_type: 'permission',
                level: 'warn',
                message: `用户拒绝执行: ${toolCall.name}`,
              })

              // 将拒绝结果作为工具失败返回
              pendingToolCalls.push({
                toolCall,
                result: {
                  ok: false,
                  tool: toolCall.name,
                  error: {
                    code: 'PERMISSION_REJECTED',
                    message: `用户拒绝执行工具 "${toolCall.name}"`,
                  },
                },
              })

              runtime.failureCount += 1
              continue
            }

            // 用户批准，继续执行
            persistedToolCallId = toolCallId
            operationLogRepo.create({
              task_id: taskId,
              conversation_id: conversationId,
              log_type: 'permission',
              level: 'info',
              message: `用户批准执行: ${toolCall.name}`,
            })
          }

          // 更新任务为 executing_tool
          taskController.updateTaskStatus(taskId, 'executing_tool')

          // 推送工具开始事件
          taskEventBus.emit({
            type: 'tool:started',
            taskId,
            toolCallId: toolCall.id,
            toolName: toolCall.name,
          })

          // 执行工具
          const toolContext: ToolExecutionContext = {
            taskId,
            conversationId,
            workspaceRoot: runtime.workspaceRoot,
            workspaceId: runtime.workspaceId ?? null,
            toolCallId: persistedToolCallId,
            permissionMode: runtime.permissionMode,
            signal: abortController.signal,
          }

          const result = await executeToolCall(toolContext, toolCall)
          pendingToolCalls.push({ toolCall, result })

          // 推送工具完成/失败事件
          if (result.ok) {
            taskEventBus.emit({
              type: 'tool:completed',
              taskId,
              toolCallId: toolCall.id,
              result: result.result,
            })
          } else {
            taskEventBus.emit({
              type: 'tool:failed',
              taskId,
              toolCallId: toolCall.id,
              error: result.error?.message || '工具执行失败',
            })
            runtime.failureCount += 1
          }

          // 恢复任务为 running
          taskController.updateTaskStatus(taskId, 'running')
        }

        // 如果被中止
        if (abortController.signal.aborted) {
          await finishTask(runtime, 'stopped', assistantMessage.id, '任务已被用户停止')
          return
        }

        // 继续下一轮
        continue
      }

      // 非法响应
      taskStepRepo.updateStatus(modelStep.id, 'failed')
      runtime.failureCount += 1
      operationLogRepo.create({
        task_id: taskId,
        conversation_id: conversationId,
        log_type: 'invalid_response',
        level: 'warn',
        message: '模型返回格式异常',
        details: modelResponse.reason,
      })

      if (runtime.failureCount >= limits.maxFailures) {
        await finishTask(runtime, 'failed', assistantMessage.id, `连续失败 ${runtime.failureCount} 次: ${modelResponse.reason}`, {
          errorCode: 'MODEL_RESPONSE_INVALID',
          errorMessage: modelResponse.reason,
        })
        return
      }

      continue
    }
  } catch (err: any) {
    const errorMsg = err?.message || 'Agent 运行时错误'
    await finishTask(runtime, 'failed', assistantMessage.id, errorMsg, {
      errorCode: 'AGENT_RUNTIME_ERROR',
      errorMessage: errorMsg,
    })
  }
}

/**
 * 完成任务
 */
async function finishTask(
  runtime: RuntimeContext,
  status: TaskStatus,
  assistantMessageId: string,
  message?: string,
  extra?: { errorCode: string; errorMessage: string }
): Promise<void> {
  const { taskId, conversationId } = runtime

  // 如果有消息，追加到 assistant 消息
  if (message && (status === 'stopped' || status === 'failed')) {
    const currentContent = messageRepo.getById(assistantMessageId)?.content || ''
    if (!currentContent.includes(message)) {
      const note = status === 'stopped' ? `\n\n> ⏹ ${message}` : `\n\n> ❌ ${message}`
      messageRepo.updateContent(assistantMessageId, currentContent + note)
    }
  }

  messageRepo.setStreaming(assistantMessageId, 0)

  // 更新任务状态
  taskController.updateTaskStatus(taskId, status, extra)

  // 记录日志
  operationLogRepo.create({
    task_id: taskId,
    conversation_id: conversationId,
    log_type: 'task_finished',
    level: status === 'completed' ? 'info' : status === 'failed' ? 'error' : 'warn',
    message: message || `任务${status === 'completed' ? '完成' : status === 'stopped' ? '已停止' : '失败'}`,
  })

  // 推送事件
  if (status === 'completed') {
    taskEventBus.emit({ type: 'task:completed', taskId })
  } else if (status === 'failed') {
    taskEventBus.emit({ type: 'task:failed', taskId, error: extra?.errorMessage || message || '任务失败' })
  } else if (status === 'stopped') {
    taskEventBus.emit({ type: 'task:stopped', taskId })
  }

  // 清理权限等待器
  rejectAllPendingPermissions(taskId)

  // 清理资源
  taskController.cleanup(taskId)
}

/**
 * 启动 Agent 任务（外部调用入口）
 */
export async function startAgentTask(request: CreateTaskRequest): Promise<string> {
  const { taskId, runtime } = await taskController.createTask(request)

  // 异步运行 Agent（不等待完成）
  runAgent(runtime).catch((err) => {
    console.error('Agent runtime error:', err)
    taskController.updateTaskStatus(taskId, 'failed', {
      errorCode: 'AGENT_RUNTIME_ERROR',
      errorMessage: err?.message || 'Agent 运行时错误',
    })
    taskController.cleanup(taskId)
  })

  return taskId
}

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
import { checkWithinLimits, TaskLimitExceededError, loadTaskLimitsFromSettings } from './task-limits'
import { executeToolCall, checkToolPermission, createPermissionRequest } from '../tools/tool-executor'
import { getProvider } from '../providers/provider-factory'
import { MessageRepository } from '../database/repositories/message.repository'
import { TaskStepRepository } from '../database/repositories/task-step.repository'
import { OperationLogRepository } from '../database/repositories/operation-log.repository'
import { taskEventBus } from '../shared/event-bus'
import type { CreateTaskRequest } from '../../shared/types'
import { MemoryService } from '../services/memory.service'
import { buildSystemPrompt } from './system-prompt'
import type { AgentRole } from './agent-profiles'

const messageRepo = new MessageRepository()
const taskStepRepo = new TaskStepRepository()
const operationLogRepo = new OperationLogRepository()
const memoryService = new MemoryService()

interface AgentRoutePlan {
  useResearch: boolean
  useMemory: boolean
  useImplementation: boolean
  reason: string
}

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
  const limits: TaskLimits = loadTaskLimitsFromSettings()

  // 标记任务为 running
  taskController.updateTaskStatus(taskId, 'running')
  taskEventBus.emit({ type: 'task:started', taskId })

  let assistantMessage = createStreamingAssistantMessage(conversationId, taskId)
  const routePlan = await routeByResponder(runtime)
  await prepareCollaboratorNotes(runtime, routePlan)

  if (!routePlan.useImplementation) {
    const finalReply = await runResponderPass(runtime, '')
    messageRepo.updateContent(assistantMessage.id, finalReply)
    messageRepo.setStreaming(assistantMessage.id, 0)
    const textSeq = taskStepRepo.getNextSequenceNo(taskId)
    const textStep = taskStepRepo.create({
      task_id: taskId,
      sequence_no: textSeq,
      step_type: 'text_response',
      content: finalReply.slice(0, 200),
    })
    taskStepRepo.updateStatus(textStep.id, 'completed')
    await finishTask(runtime, 'completed', assistantMessage.id)
    return
  }

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
        workspaceId: runtime.workspaceId ?? null,
        providerType: runtime.providerConfig.providerType,
        permissionMode: runtime.permissionMode,
        workspaceName: runtime.workspaceName,
        workspaceRootName: runtime.workspaceRootName,
        userContent: runtime.userContent,
        implementationPrompt: runtime.implementationPrompt,
        collaboratorNotes: runtime.collaboratorNotes,
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
      let usageTotalTokens: number | null = null

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
              messageId: assistantMessage.id,
              content: currentText,
              delta: streamEvent.content,
            })
            // 更新 assistant 消息
            messageRepo.updateContent(assistantMessage.id, currentText)
          } else if (streamEvent.type === 'tool_call_delta') {
            accumulator.processDelta({ tool_calls: streamEvent.delta })
          } else if (streamEvent.type === 'finish') {
            usageTotalTokens = streamEvent.usage?.totalTokens ?? usageTotalTokens
            accumulator.setFinishReason(streamEvent.reason)
          } else if (streamEvent.type === 'done') {
            usageTotalTokens = streamEvent.usage?.totalTokens ?? usageTotalTokens
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
      messageRepo.updateTokenCount(assistantMessage.id, usageTotalTokens)
      taskStepRepo.updateStatus(modelStep.id, 'completed')

      // 处理最终文本
      if (modelResponse.type === 'final_text') {
        const implementationOutput = modelResponse.content
        const finalReply = await runResponderPass(runtime, implementationOutput)
        messageRepo.updateContent(assistantMessage.id, finalReply)
        messageRepo.setStreaming(assistantMessage.id, 0)

        // 创建 text_response 步骤
        const textSeq = taskStepRepo.getNextSequenceNo(taskId)
        const textStep = taskStepRepo.create({
          task_id: taskId,
          sequence_no: textSeq,
          step_type: 'text_response',
          content: finalReply.slice(0, 200),
        })
        taskStepRepo.updateStatus(textStep.id, 'completed')

        const implSeq = taskStepRepo.getNextSequenceNo(taskId)
        const implStep = taskStepRepo.create({
          task_id: taskId,
          sequence_no: implSeq,
          step_type: 'implementation_result',
          content: implementationOutput.slice(0, 4000),
        })
        taskStepRepo.updateStatus(implStep.id, 'completed')

        operationLogRepo.create({
          task_id: taskId,
          conversation_id: conversationId,
          log_type: 'task_completed',
          message: '任务完成，主对话 Agent 已输出最终答复',
        })

        await finishTask(runtime, 'completed', assistantMessage.id)
        return
      }

      // 处理工具调用
      if (modelResponse.type === 'tool_calls' || modelResponse.type === 'tool_calls_with_text') {
        // 如果同时有文本内容，先保存到 assistant 消息
        if (modelResponse.type === 'tool_calls_with_text') {
          const textContent = modelResponse.textContent.trim()
          if (textContent) {
            messageRepo.updateContent(assistantMessage.id, modelResponse.textContent)
            messageRepo.setStreaming(assistantMessage.id, 0)
            assistantMessage = createStreamingAssistantMessage(conversationId, taskId)
          }
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

async function prepareCollaboratorNotes(runtime: RuntimeContext, routePlan: AgentRoutePlan): Promise<void> {
  if (!runtime.multiAgentEnabled) {
    return
  }

  const roles: Array<Exclude<AgentRole, 'implementation' | 'responder'>> = []
  if (routePlan.useResearch) roles.push('research')
  if (routePlan.useMemory) roles.push('memory')

  for (const role of roles) {
    const config = runtime.collaboratorConfigs[role]
    if (!config) continue
    const label = role === 'research' ? '资料整理 Agent' : '规则记忆 Agent'

    const seqNo = taskStepRepo.getNextSequenceNo(runtime.taskId)
    const step = taskStepRepo.create({
      task_id: runtime.taskId,
      sequence_no: seqNo,
      step_type: 'agent_brief',
      content: `${label} 正在生成内部简报`,
    })
    taskStepRepo.updateStatus(step.id, 'running')

    try {
      const note = await runCollaboratorAgentPass(role, runtime, config.providerConfig, config.prompt)
      runtime.collaboratorNotes[role] = note
      taskStepRepo.updateContent(step.id, `[${label}]\n\n${note}`.slice(0, 4000))
      taskStepRepo.updateStatus(step.id, 'completed')
      operationLogRepo.create({
        task_id: runtime.taskId,
        conversation_id: runtime.conversationId,
        log_type: 'multi_agent_brief',
        message: `${label} 已生成内部简报`,
        details: note.slice(0, 1000),
      })
    } catch (err: any) {
      taskStepRepo.updateStatus(step.id, 'failed')
      operationLogRepo.create({
        task_id: runtime.taskId,
        conversation_id: runtime.conversationId,
        log_type: 'multi_agent_brief_failed',
        level: 'warn',
        message: `${label} 生成失败，继续使用主 Agent`,
        details: err?.message || String(err),
      })
    }
  }
}

async function routeByResponder(runtime: RuntimeContext): Promise<AgentRoutePlan> {
  const seqNo = taskStepRepo.getNextSequenceNo(runtime.taskId)
  const step = taskStepRepo.create({
    task_id: runtime.taskId,
    sequence_no: seqNo,
    step_type: 'agent_route',
    content: '主对话 Agent 正在判断需要调用哪些 Agent',
  })
  taskStepRepo.updateStatus(step.id, 'running')

  try {
    const provider = getProvider(runtime.responderConfig.providerConfig.providerType)
    const systemPrompt = buildSystemPrompt({
      permissionMode: runtime.workspaceRoot ? 'read' : 'chat',
      workspaceId: runtime.workspaceId ?? null,
      workspaceName: runtime.workspaceName,
      workspaceRootName: runtime.workspaceRootName,
      agentRole: 'responder',
      agentPromptOverride: runtime.responderConfig.prompt,
    })

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      {
        role: 'system' as const,
        content:
          '你现在是任务调度者。请判断这轮是否需要调用以下 Agent：资料整理 Agent、规则记忆 Agent、代码实现 Agent。' +
          '如果用户只是普通问答或无需工作区执行，可以不调用代码实现 Agent。' +
          '只输出 JSON，不要加解释。格式：{"useResearch":boolean,"useMemory":boolean,"useImplementation":boolean,"reason":"简短中文原因"}',
      },
      {
        role: 'user' as const,
        content: [
          `用户请求：${runtime.userContent}`,
          runtime.workspaceName ? `当前工作区：${runtime.workspaceName}` : '当前未绑定工作区',
          `当前权限模式：${runtime.permissionMode}`,
        ].join('\n'),
      },
    ]

    let content = ''
    for await (const event of provider.streamChat(
      { messages, config: runtime.responderConfig.providerConfig },
      runtime.abortController.signal
    )) {
      if (runtime.abortController.signal.aborted) {
        throw new Error('主对话 Agent 路由已被中止')
      }
      if (event.type === 'delta') {
        content += event.content
      } else if (event.type === 'error') {
        throw new Error(event.error.message)
      } else if (event.type === 'done') {
        break
      }
    }

    const plan = parseRoutePlan(content, !!runtime.workspaceRoot)
    taskStepRepo.updateContent(
      step.id,
      `[主对话 Agent]\n\n调用决策：${[
        plan.useResearch ? '资料整理' : '',
        plan.useMemory ? '规则记忆' : '',
        plan.useImplementation ? '代码实现' : '',
      ].filter(Boolean).join(' / ') || '无子 Agent'}\n\n原因：${plan.reason}`
    )
    taskStepRepo.updateStatus(step.id, 'completed')
    return plan
  } catch (err: any) {
    const fallback: AgentRoutePlan = {
      useResearch: !!runtime.workspaceRoot,
      useMemory: !!runtime.workspaceRoot,
      useImplementation: !!runtime.workspaceRoot,
      reason: '路由失败，按保守默认策略处理',
    }
    taskStepRepo.updateContent(step.id, `[主对话 Agent]\n\n路由失败，已回退到默认策略。\n\n原因：${err?.message || String(err)}`)
    taskStepRepo.updateStatus(step.id, 'failed')
    return fallback
  }
}

function parseRoutePlan(raw: string, hasWorkspace: boolean): AgentRoutePlan {
  const match = raw.match(/\{[\s\S]*\}/)
  const fallback: AgentRoutePlan = {
    useResearch: hasWorkspace,
    useMemory: hasWorkspace,
    useImplementation: hasWorkspace,
    reason: '未解析到有效路由结果，按默认策略处理',
  }

  if (!match) return fallback

  try {
    const parsed = JSON.parse(match[0])
    return {
      useResearch: Boolean(parsed.useResearch),
      useMemory: Boolean(parsed.useMemory),
      useImplementation: Boolean(parsed.useImplementation),
      reason: typeof parsed.reason === 'string' && parsed.reason.trim() ? parsed.reason.trim() : fallback.reason,
    }
  } catch {
    return fallback
  }
}

async function runResponderPass(runtime: RuntimeContext, implementationOutput: string): Promise<string> {
  const seqNo = taskStepRepo.getNextSequenceNo(runtime.taskId)
  const step = taskStepRepo.create({
    task_id: runtime.taskId,
    sequence_no: seqNo,
    step_type: 'agent_brief',
    content: '主对话 Agent 正在整理最终回复',
  })
  taskStepRepo.updateStatus(step.id, 'running')

  try {
    const provider = getProvider(runtime.responderConfig.providerConfig.providerType)
    const conversationSummary = memoryService.getConversationSummary(runtime.conversationId)?.summary ?? ''
    const systemPrompt = buildSystemPrompt({
      permissionMode: 'chat',
      workspaceId: runtime.workspaceId ?? null,
      workspaceName: runtime.workspaceName,
      workspaceRootName: runtime.workspaceRootName,
      agentRole: 'responder',
      agentPromptOverride: runtime.responderConfig.prompt,
    })

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      {
        role: 'system' as const,
        content: '你现在负责面向用户输出最终答复。禁止调用工具，禁止编造未发生的操作。请基于执行结果整理成自然中文回复。',
      },
      ...(conversationSummary
        ? [{ role: 'system' as const, content: `当前会话摘要：\n${conversationSummary}` }]
        : []),
      ...(runtime.collaboratorNotes.research
        ? [{ role: 'system' as const, content: `资料整理 Agent 简报：\n${runtime.collaboratorNotes.research}` }]
        : []),
      ...(runtime.collaboratorNotes.memory
        ? [{ role: 'system' as const, content: `规则记忆 Agent 简报：\n${runtime.collaboratorNotes.memory}` }]
        : []),
      {
        role: 'system' as const,
        content: `代码实现 Agent 执行结论：\n${implementationOutput}`,
      },
      {
        role: 'user' as const,
        content: `请根据以上内容，对用户的原始请求给出最终回复。\n原始请求：${runtime.userContent}`,
      },
    ]

    let content = ''
    for await (const event of provider.streamChat(
      { messages, config: runtime.responderConfig.providerConfig },
      runtime.abortController.signal
    )) {
      if (runtime.abortController.signal.aborted) {
        throw new Error('主对话 Agent 已被中止')
      }
      if (event.type === 'delta') {
        content += event.content
      } else if (event.type === 'error') {
        throw new Error(event.error.message)
      } else if (event.type === 'done') {
        break
      }
    }

    const finalReply = content.trim() || implementationOutput
    taskStepRepo.updateContent(step.id, `[主对话 Agent]\n\n${finalReply}`.slice(0, 4000))
    taskStepRepo.updateStatus(step.id, 'completed')
    operationLogRepo.create({
      task_id: runtime.taskId,
      conversation_id: runtime.conversationId,
      log_type: 'multi_agent_brief',
      message: '主对话 Agent 已整理最终回复',
      details: finalReply.slice(0, 1000),
    })
    return finalReply
  } catch (err: any) {
    taskStepRepo.updateStatus(step.id, 'failed')
    operationLogRepo.create({
      task_id: runtime.taskId,
      conversation_id: runtime.conversationId,
      log_type: 'multi_agent_brief_failed',
      level: 'warn',
      message: '主对话 Agent 整理失败，回退到代码实现 Agent 原始结论',
      details: err?.message || String(err),
    })
    return implementationOutput
  }
}

async function runCollaboratorAgentPass(
  role: Exclude<AgentRole, 'implementation'>,
  runtime: RuntimeContext,
  providerConfig: RuntimeContext['providerConfig'],
  prompt: string
): Promise<string> {
  const provider = getProvider(providerConfig.providerType)
  const conversationSummary = memoryService.getConversationSummary(runtime.conversationId)?.summary ?? ''
  const agentLabel = role === 'research' ? '资料整理 Agent' : '规则记忆 Agent'
  const systemPrompt = buildSystemPrompt({
    permissionMode: runtime.workspaceRoot ? 'read' : 'chat',
    workspaceId: runtime.workspaceId ?? null,
    workspaceName: runtime.workspaceName,
    workspaceRootName: runtime.workspaceRootName,
    agentRole: role,
    agentPromptOverride: prompt,
  })

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    {
      role: 'system' as const,
      content:
        role === 'research'
          ? '你现在只输出给实现 Agent 使用的内部简报。禁止调用工具，禁止直接对用户说话。请用简洁中文输出：目标、上下文、风险、建议顺序。'
          : '你现在只输出给实现 Agent 使用的内部规则列表。禁止调用工具，禁止直接对用户说话。请用简洁中文输出：必须遵守、偏好、工作区规则、回避事项。',
    },
    ...(conversationSummary
      ? [{ role: 'system' as const, content: `当前会话摘要：\n${conversationSummary}` }]
      : []),
    {
      role: 'user' as const,
      content: [
        `当前用户任务：${runtime.userContent}`,
        runtime.workspaceName ? `当前工作区：${runtime.workspaceName}` : '当前没有绑定工作区',
        runtime.collaboratorNotes.research && role === 'memory'
          ? `资料整理 Agent 已知简报：${runtime.collaboratorNotes.research}`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ]

  let content = ''
  for await (const event of provider.streamChat({ messages, config: providerConfig }, runtime.abortController.signal)) {
    if (runtime.abortController.signal.aborted) {
      throw new Error(`${agentLabel} 已被中止`)
    }
    if (event.type === 'delta') {
      content += event.content
    } else if (event.type === 'error') {
      throw new Error(event.error.message)
    } else if (event.type === 'done') {
      break
    }
  }

  return content.trim()
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
  memoryService.refreshConversationSummary(conversationId)
  if (runtime.workspaceId) {
    memoryService.refreshWorkspaceRuleSummary(runtime.workspaceId)
  }

  // 清理资源
  taskController.cleanup(taskId)
}

function createStreamingAssistantMessage(conversationId: string, taskId: string) {
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
  return assistantMessage
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

import { randomUUID } from 'crypto'
import type { ModelRequest } from '../providers/model-provider'
import type {
  ModelToolCall,
  ToolExecutionResult,
  ToolExecutionContext,
} from '../tools/agent-tool.types'
import type { TaskStatus } from '../../shared/types'
import { taskController, type RuntimeContext } from './task-controller'
import { buildContext, buildContextSnapshotSummary } from './context-builder'
import { StreamAccumulator } from './response-parser'
import { checkWithinLimits, TaskLimitExceededError, loadTaskLimitsFromSettings } from './task-limits'
import { executeToolCall, checkToolPermission, createPermissionRequest } from '../tools/tool-executor'
import { getProvider } from '../providers/provider-factory'
import { MessageRepository } from '../database/repositories/message.repository'
import { TaskStepRepository } from '../database/repositories/task-step.repository'
import { OperationLogRepository } from '../database/repositories/operation-log.repository'
import { TaskRepository } from '../database/repositories/task.repository'
import { taskEventBus } from '../shared/event-bus'
import { MemoryService } from '../services/memory.service'
import { buildSystemPrompt } from './system-prompt'
import type { AgentRole } from './agent-profiles'
import { throttle } from '../utils/throttle'
import { analyzeConversationCorrection, buildCorrectionNotice } from './conversation-corrections'
import { ToolCallRepository } from '../database/repositories/tool-call.repository'
import { buildExecutionFactSummary } from './execution-facts'
import {
  buildTaskResultSummaryObject,
  mergeReplyWithTaskResultSummary,
  recordTaskResultSummaryStep,
  renderTaskResultSummary,
} from './task-result-summary'

const messageRepo = new MessageRepository()
const taskStepRepo = new TaskStepRepository()
const operationLogRepo = new OperationLogRepository()
const taskRepo = new TaskRepository()
const memoryService = new MemoryService()
const toolCallRepo = new ToolCallRepository()

export interface AgentRoutePlan {
  useResearch: boolean
  useMemory: boolean
  useImplementation: boolean
  reason: string
}

function formatRouteStepContent(plan: AgentRoutePlan): string {
  const agents = [
    plan.useResearch ? '资料整理' : '',
    plan.useMemory ? '规则记忆' : '',
    plan.useImplementation ? '代码实现' : '',
  ].filter(Boolean)

  return [
    `调用决策：${agents.join(' / ') || '无子 Agent'}`,
    `原因：${plan.reason}`,
  ].join('\n\n')
}

/** 权限审批超时时间（毫秒） */
const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000

const permissionResolvers = new Map<string, {
  taskId: string
  resolve: (approved: boolean) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}>()

export class TaskTerminalError extends Error {
  status: TaskStatus
  errorCode?: string
  assistantMessageId: string

  constructor(options: {
    status: TaskStatus
    assistantMessageId: string
    message: string
    errorCode?: string
  }) {
    super(options.message)
    this.name = 'TaskTerminalError'
    this.status = options.status
    this.errorCode = options.errorCode
    this.assistantMessageId = options.assistantMessageId
  }
}

export function registerPermissionResolver(requestId: string, taskId: string): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (permissionResolvers.has(requestId)) {
        permissionResolvers.delete(requestId)
        resolve(false)
      }
    }, PERMISSION_TIMEOUT_MS)

    permissionResolvers.set(requestId, { taskId, resolve, reject, timer })
  })
}

export function resolvePermission(requestId: string, approved: boolean): void {
  const resolver = permissionResolvers.get(requestId)
  if (resolver) {
    clearTimeout(resolver.timer)
    resolver.resolve(approved)
    permissionResolvers.delete(requestId)
  }
}

export function rejectAllPendingPermissions(taskId: string): void {
  for (const [requestId, resolver] of permissionResolvers) {
    if (resolver.taskId === taskId) {
      clearTimeout(resolver.timer)
      resolver.resolve(false)
      permissionResolvers.delete(requestId)
    }
  }
}

export function createStreamingAssistantMessage(conversationId: string, taskId: string) {
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

function matchesShortExecutionConfirmation(content: string): boolean {
  const normalized = content
    .trim()
    .toLowerCase()
    .replace(/[！!。,.，？?~～\s]/g, '')

  if (!normalized) return false

  const exactMatches = new Set([
    '开写吧',
    '开始',
    '开始开始',
    '继续',
    '继续吧',
    '来吧',
    '做吧',
    '搞吧',
    '弄吧',
    '写吧',
    '写啊',
    '开始写',
    '直接写',
    '开工',
    '开搞',
    '就这个',
    '就按这个',
    '按这个来',
    '可以',
    '行',
    '好',
    '好的',
  ])

  if (exactMatches.has(normalized)) {
    return true
  }

  return /^(开始写|直接做|直接写|继续做|继续写|马上写|现在写|开写|开工|开搞)/.test(normalized)
}

function shouldContinuePriorImplementation(runtime: RuntimeContext, content: string): boolean {
  if (!matchesShortExecutionConfirmation(content)) {
    return false
  }

  const recentMessages = messageRepo.getRecentByConversationId(runtime.conversationId, 8)
  const assistantMessages = recentMessages.filter((message) => message.role === 'assistant')
  const lastAssistantMessage = assistantMessages[assistantMessages.length - 1]
  if (!lastAssistantMessage?.content) {
    return false
  }

  const assistantContent = lastAssistantMessage.content.toLowerCase()
  const executionOfferHints = [
    '要开写吗',
    '要我',
    '我可以立刻',
    '我现在马上',
    '我这就',
    '帮你写',
    '生成一个',
    '创建一个',
    '写一个',
    '直接给你',
    '马上开始',
    '立刻开工',
    '可以帮你做',
    '开始写',
  ]

  return executionOfferHints.some((hint) => assistantContent.includes(hint))
}

function pickFastRoutePlan(runtime: RuntimeContext): AgentRoutePlan | null {
  const content = runtime.userContent.trim()
  const normalized = content.toLowerCase()
  const hasWorkspace = !!runtime.workspaceRoot
  const recentMessages = messageRepo.getRecentByConversationId(runtime.conversationId, 8)
  const correctionSignal = analyzeConversationCorrection(content, recentMessages)

  if (!content) {
    return {
      useResearch: false,
      useMemory: false,
      useImplementation: false,
      reason: '空请求，跳过调度',
    }
  }

  if (!hasWorkspace) {
    return {
      useResearch: false,
      useMemory: false,
      useImplementation: false,
      reason: '未绑定工作区，直接走普通回复',
    }
  }

  const implementationHints = [
    '代码', '文件', '项目', '仓库', '工作区', '目录', '函数', '类', '模块', '报错', 'bug', '修复', '修改',
    '重构', '实现', '创建', '删除', '运行', '命令', '构建', '测试', '搜索', '查找', '读取', '分析项目',
    '检查', '生成', '安装', '启动', 'debug', 'fix', 'refactor', 'build', 'test',
  ]
  const researchHints = ['梳理', '总结', '架构', '方案', '排查', '定位', '优化', 'review', '分析']
  const memoryHints = ['记住', '偏好', '规则', '规范', '命名', '约定', '风格', '以后都', '统一']
  const plainChatHints = ['你好', '你是谁', '谢谢', '天气', '翻译', '解释这个词', '介绍一下']

  if (correctionSignal.shouldPreferImplementation) {
    return {
      useResearch: correctionSignal.deniesPriorAssistantResult,
      useMemory: false,
      useImplementation: true,
      reason: `${correctionSignal.reason}，优先进入实现链路`,
    }
  }

  if (plainChatHints.some((hint) => normalized.includes(hint))) {
    return {
      useResearch: false,
      useMemory: false,
      useImplementation: false,
      reason: '明显是轻量对话，跳过调度',
    }
  }

  if (shouldContinuePriorImplementation(runtime, content)) {
    return {
      useResearch: false,
      useMemory: false,
      useImplementation: true,
      reason: '识别为对上一轮执行提议的确认，直接进入实现链路',
    }
  }

  const useImplementation = implementationHints.some((hint) => normalized.includes(hint))
  if (!useImplementation) {
    return {
      useResearch: false,
      useMemory: false,
      useImplementation: false,
      reason: '未命中执行信号，直接走普通回复',
    }
  }

  const useResearch = content.length >= 60 || researchHints.some((hint) => normalized.includes(hint))
  const useMemory = memoryHints.some((hint) => normalized.includes(hint))

  return {
    useResearch,
    useMemory,
    useImplementation: true,
    reason: '命中快速规则，跳过调度模型',
  }
}

export async function routeByResponder(runtime: RuntimeContext): Promise<AgentRoutePlan> {
  const seqNo = taskStepRepo.getNextSequenceNo(runtime.taskId)
  const step = taskStepRepo.create({
    task_id: runtime.taskId,
    sequence_no: seqNo,
    step_type: 'agent_route',
    content: '主对话 Agent 正在判断需要调用哪些 Agent',
  })
  taskStepRepo.updateStatus(step.id, 'running')

  try {
    const fastPlan = pickFastRoutePlan(runtime)
    if (fastPlan) {
      taskStepRepo.updateContent(
        step.id,
        formatRouteStepContent(fastPlan)
      )
      taskStepRepo.updateStatus(step.id, 'completed')
      return fastPlan
    }

    const provider = getProvider(runtime.responderConfig.providerConfig.providerType)
    const recentMessages = messageRepo.getRecentByConversationId(runtime.conversationId, 8)
    const correctionSignal = analyzeConversationCorrection(runtime.userContent, recentMessages)
    const systemPrompt = buildSystemPrompt({
      permissionMode: runtime.permissionMode,
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
          '如果用户在纠正上一轮结果、否认“已改/已写/已执行”、催促继续修改或确认继续执行，并且当前会话绑定工作区，必须强烈倾向调用代码实现 Agent。' +
          '只输出 JSON，不要加解释。格式：{"useResearch":boolean,"useMemory":boolean,"useImplementation":boolean,"reason":"简短中文原因"}',
      },
      {
        role: 'user' as const,
        content: [
          `用户请求：${runtime.userContent}`,
          runtime.workspaceName ? `当前工作区：${runtime.workspaceName}` : '当前未绑定工作区',
          `当前权限模式：${runtime.permissionMode}`,
          correctionSignal.shouldPreferImplementation
            ? `最近上下文信号：${correctionSignal.reason}。上一轮 assistant ${correctionSignal.priorAssistantActionClaim ? '存在执行承诺或完成声明' : '没有明确执行声明'}。`
            : '',
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
      formatRouteStepContent(plan)
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

export async function runCollaboratorBrief(
  role: Exclude<AgentRole, 'implementation' | 'responder'>,
  runtime: RuntimeContext
): Promise<string> {
  const config = runtime.collaboratorConfigs[role]
  if (!config) {
    return ''
  }

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
    return note
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
    return ''
  }
}

export async function runResponderPass(
  runtime: RuntimeContext,
  implementationOutput: string,
  assistantMessageId?: string
): Promise<string> {
  const seqNo = taskStepRepo.getNextSequenceNo(runtime.taskId)
  const step = taskStepRepo.create({
    task_id: runtime.taskId,
    sequence_no: seqNo,
    step_type: 'agent_brief',
    content: '主对话 Agent 正在整理最终回复',
  })
  taskStepRepo.updateStatus(step.id, 'running')

  const throttledPushDelta = assistantMessageId
    ? throttle((content: string, delta: string) => {
        taskEventBus.emit({
          type: 'message:delta',
          taskId: runtime.taskId,
          messageId: assistantMessageId,
          content,
          delta,
        })
        messageRepo.updateContent(assistantMessageId, content)
      }, 50)
    : null

  try {
    const provider = getProvider(runtime.responderConfig.providerConfig.providerType)
    const conversationSummary = memoryService.getConversationSummary(runtime.conversationId)?.summary ?? ''
    const recentMessages = messageRepo.getRecentByConversationId(runtime.conversationId, 8)
    const correctionNotice = buildCorrectionNotice(
      analyzeConversationCorrection(runtime.userContent, recentMessages)
    )
    const executionFacts = buildExecutionFactSummary(runtime.taskId)
    const taskResultSummaryObject = buildTaskResultSummaryObject(runtime.taskId, executionFacts)
    recordTaskResultSummaryStep(runtime.taskId, taskResultSummaryObject)
    const taskResultSummary = renderTaskResultSummary(taskResultSummaryObject)
    const systemPrompt = buildSystemPrompt({
      permissionMode: runtime.permissionMode,
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
          '你现在负责面向用户输出最终答复。禁止调用工具，禁止编造未发生的操作。' +
          '最终回复必须以“真实执行事实摘要”为准；代码实现 Agent 的自然语言结论只能作为参考，不能覆盖工具事实。',
      },
      {
        role: 'system' as const,
        content: executionFacts.text,
      },
      {
        role: 'system' as const,
        content:
          '最终回复必须使用下面的交付摘要结构，不要删除这些区块标题；可以在区块前加一句简短自然语言说明，但事实必须以该摘要为准。\n\n' +
          taskResultSummary,
      },
      ...(correctionNotice
        ? [{ role: 'system' as const, content: correctionNotice }]
        : []),
      ...(conversationSummary
        ? [{ role: 'system' as const, content: `当前会话摘要（如与最新用户纠正或真实执行事实冲突，以后者为准）：\n${conversationSummary}` }]
        : []),
      ...(runtime.collaboratorNotes.research
        ? [{ role: 'system' as const, content: `资料整理 Agent 简报：\n${runtime.collaboratorNotes.research}` }]
        : []),
      ...(runtime.collaboratorNotes.memory
        ? [{ role: 'system' as const, content: `规则记忆 Agent 简报：\n${runtime.collaboratorNotes.memory}` }]
        : []),
      ...(implementationOutput
        ? [{ role: 'system' as const, content: `代码实现 Agent 执行结论：\n${implementationOutput}` }]
        : []),
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
        throttledPushDelta?.(content, event.content)
      } else if (event.type === 'error') {
        throttledPushDelta?.flush()
        throw new Error(event.error.message)
      } else if (event.type === 'done') {
        throttledPushDelta?.flush()
        break
      }
    }

    const finalReply = mergeReplyWithTaskResultSummary(
      enforceFinalReplyFacts(content.trim() || implementationOutput, executionFacts),
      taskResultSummary
    )
    if (assistantMessageId) {
      messageRepo.updateContent(assistantMessageId, finalReply)
      taskEventBus.emit({
        type: 'message:delta',
        taskId: runtime.taskId,
        messageId: assistantMessageId,
        content: finalReply,
        delta: finalReply,
      })
    }
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
    throttledPushDelta?.flush()
    taskStepRepo.updateStatus(step.id, 'failed')
    operationLogRepo.create({
      task_id: runtime.taskId,
      conversation_id: runtime.conversationId,
      log_type: 'multi_agent_brief_failed',
      level: 'warn',
      message: '主对话 Agent 整理失败，回退到代码实现 Agent 原始结论',
      details: err?.message || String(err),
    })
    const fallbackFacts = buildExecutionFactSummary(runtime.taskId)
    const fallbackSummaryObject = buildTaskResultSummaryObject(runtime.taskId, fallbackFacts)
    recordTaskResultSummaryStep(runtime.taskId, fallbackSummaryObject)
    return mergeReplyWithTaskResultSummary(
      enforceFinalReplyFacts(implementationOutput, fallbackFacts),
      renderTaskResultSummary(fallbackSummaryObject)
    )
  }
}

export function enforceFinalReplyFacts(reply: string, facts: ReturnType<typeof buildExecutionFactSummary>): string {
  let finalReply = reply.trim()
  if (!finalReply) {
    finalReply = facts.hasRejectedPermission
      ? '未执行修改：相关权限请求已被拒绝，所以没有写入或更改文件。'
      : '这轮没有产生可确认的执行结果。'
  }

  if (!facts.hasSuccessfulWrite) {
    const unsafeCompletionPattern = /(已经|已)(改好|修改|写入|写好|覆盖|更新|创建|生成|保存)|(改好了|写好了|创建好了|更新好了|保存好了)/
    if (unsafeCompletionPattern.test(finalReply)) {
      const reason = facts.hasRejectedPermission
        ? '权限请求被拒绝，相关写入操作未执行。'
        : '本轮没有真实成功写入记录。'
      finalReply = [
        `未确认有文件写入或修改：${reason}`,
        facts.failedToolSummaries.length ? `失败信息：${facts.failedToolSummaries.join('；')}` : '',
        facts.rejectedPermissionTargets.length ? `未执行项：${facts.rejectedPermissionTargets.join('；')}` : '',
      ].filter(Boolean).join('\n')
    }
  }

  if (!facts.hasSuccessfulCommand) {
    const unsafeCommandPattern = /(已经|已)(执行|运行)(了)?|(执行完了|跑完了|运行完了)/
    if (unsafeCommandPattern.test(finalReply)) {
      const reason = facts.hasRejectedPermission
        ? '权限请求被拒绝，相关命令未执行。'
        : '本轮没有真实成功命令记录。'
      finalReply = [
        `未确认有命令执行成功：${reason}`,
        facts.failedToolSummaries.length ? `失败信息：${facts.failedToolSummaries.join('；')}` : '',
        facts.rejectedPermissionTargets.length ? `未执行项：${facts.rejectedPermissionTargets.join('；')}` : '',
      ].filter(Boolean).join('\n')
    }
  }

  if (facts.hasRejectedPermission && !/(未执行|未修改|没有执行|没有修改|权限.*拒绝|拒绝.*权限)/.test(finalReply)) {
    finalReply += `\n\n注意：权限请求已被拒绝，相关操作未执行、未修改。`
  }

  return finalReply
}

export async function runImplementationPass(
  runtime: RuntimeContext,
  initialAssistantMessageId: string
): Promise<{ assistantMessageId: string; implementationOutput: string }> {
  const { taskId, conversationId, abortController } = runtime
  const limits = loadTaskLimitsFromSettings()
  let assistantMessageId = initialAssistantMessageId
  let activeAssistantMessageId = assistantMessageId
  let pendingToolCalls: Array<{ toolCall: ModelToolCall; result: ToolExecutionResult }> | undefined
  const throttledPushDelta = throttle((content: string, delta: string) => {
    taskEventBus.emit({
      type: 'message:delta',
      taskId,
      messageId: activeAssistantMessageId,
      content,
      delta,
    })
    messageRepo.updateContent(activeAssistantMessageId, content)
  }, 50)

  while (true) {
    if (abortController.signal.aborted) {
      throw new TaskTerminalError({
        status: 'stopped',
        assistantMessageId,
        message: '任务已被用户停止',
      })
    }

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
        throw new TaskTerminalError({
          status: 'failed',
          assistantMessageId,
          message: err.message,
          errorCode: err.code,
        })
      }
      throw err
    }

    const { messages, tools } = buildContext({
      taskId,
      conversationId,
      userMessageId: runtime.userMessageId,
      workspaceId: runtime.workspaceId ?? null,
      providerType: runtime.providerConfig.providerType,
      permissionMode: runtime.permissionMode,
      workspaceName: runtime.workspaceName,
      workspaceRootName: runtime.workspaceRootName,
      userContent: runtime.userContent,
      implementationPrompt: runtime.implementationPrompt,
      collaboratorNotes: runtime.collaboratorNotes,
      contextMessageLimit: runtime.providerConfig.contextMessageLimit,
      toolsEnabled: runtime.providerConfig.toolsEnabled,
      pendingToolCalls,
    })

    const contextSnapshotStep = taskStepRepo.create({
      task_id: taskId,
      sequence_no: taskStepRepo.getNextSequenceNo(taskId),
      step_type: 'context_snapshot',
      content: buildContextSnapshotSummary({
        round: runtime.round,
        messages,
        tools,
        aiConfig: {
          providerLabel: `${runtime.providerConfig.name} · ${runtime.providerConfig.model}`,
          contextMessageLimit: runtime.providerConfig.contextMessageLimit,
          streamEnabled: runtime.providerConfig.streamEnabled,
          toolsEnabled: runtime.providerConfig.toolsEnabled,
        },
        skillNames: messages
          .filter((message) => message.role === 'system' && String(message.content).startsWith('本轮用户显式引用了 TieX Skill：'))
          .map((message) => String(message.content).split('\n')[0].replace('本轮用户显式引用了 TieX Skill：', '')),
      }),
    })
    taskStepRepo.updateStatus(contextSnapshotStep.id, 'completed')

    const seqNo = taskStepRepo.getNextSequenceNo(taskId)
    const modelStep = taskStepRepo.create({
      task_id: taskId,
      sequence_no: seqNo,
      step_type: 'model_request',
      content: `第 ${runtime.round + 1} 轮模型请求`,
    })
    taskStepRepo.updateStatus(modelStep.id, 'running')

    const modelRequest: ModelRequest = {
      messages: messages as any,
      temperature: runtime.providerConfig.temperature,
      topP: runtime.providerConfig.topP,
      maxTokens: runtime.providerConfig.maxTokens,
      tools: runtime.providerConfig.toolsEnabled === false ? undefined : (tools.length > 0 ? tools : undefined),
      toolChoice: runtime.providerConfig.toolsEnabled === false ? undefined : (tools.length > 0 ? 'auto' : undefined),
      config: runtime.providerConfig,
    }

    const accumulator = new StreamAccumulator()
    let modelError: { code: string; message: string } | null = null
    let usageTotalTokens: number | null = null

    try {
      const provider = getProvider(runtime.providerConfig.providerType)
      for await (const streamEvent of provider.streamChat(modelRequest, abortController.signal)) {
        if (abortController.signal.aborted) break

        if (streamEvent.type === 'delta') {
          accumulator.processDelta({ content: streamEvent.content })
          const currentText = accumulator.getTextContent()
          throttledPushDelta(currentText, streamEvent.content)
        } else if (streamEvent.type === 'tool_call_delta') {
          accumulator.processDelta({ tool_calls: streamEvent.delta })
        } else if (streamEvent.type === 'finish') {
          usageTotalTokens = streamEvent.usage?.totalTokens ?? usageTotalTokens
          accumulator.setFinishReason(streamEvent.reason)
        } else if (streamEvent.type === 'done') {
          usageTotalTokens = streamEvent.usage?.totalTokens ?? usageTotalTokens
          throttledPushDelta.flush()
          break
        } else if (streamEvent.type === 'error') {
          throttledPushDelta.flush()
          modelError = {
            code: streamEvent.error.code,
            message: streamEvent.error.message,
          }
          break
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || abortController.signal.aborted) {
        throw new TaskTerminalError({
          status: 'stopped',
          assistantMessageId,
          message: '任务已被用户停止',
        })
      }
      modelError = {
        code: 'PROVIDER_NETWORK_ERROR',
        message: err.message || '模型请求失败',
      }
    }

    if (abortController.signal.aborted) {
      throttledPushDelta.flush()
      taskStepRepo.updateStatus(modelStep.id, 'failed')
      throw new TaskTerminalError({
        status: 'stopped',
        assistantMessageId,
        message: '任务已被用户停止',
      })
    }

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

      const errorText = `\n\n> 模型请求失败: ${modelError.message}`
      messageRepo.updateContent(assistantMessageId, (messageRepo.getById(assistantMessageId)?.content || '') + errorText)

      if (runtime.failureCount >= limits.maxFailures) {
        throw new TaskTerminalError({
          status: 'failed',
          assistantMessageId,
          message: `连续失败 ${runtime.failureCount} 次: ${modelError.message}`,
          errorCode: modelError.code,
        })
      }
      continue
    }

    const modelResponse = accumulator.parseResponse()
    runtime.round += 1
    messageRepo.updateTokenCount(assistantMessageId, usageTotalTokens)
    taskStepRepo.updateStatus(modelStep.id, 'completed')

    if (modelResponse.type === 'final_text') {
      return {
        assistantMessageId,
        implementationOutput: modelResponse.content,
      }
    }

    if (modelResponse.type === 'tool_calls' || modelResponse.type === 'tool_calls_with_text') {
      if (modelResponse.type === 'tool_calls_with_text') {
        const textContent = modelResponse.textContent.trim()
        if (textContent) {
          throttledPushDelta.flush()
          messageRepo.updateContent(assistantMessageId, modelResponse.textContent)
          messageRepo.setStreaming(assistantMessageId, 0)
          assistantMessageId = createStreamingAssistantMessage(conversationId, taskId).id
          activeAssistantMessageId = assistantMessageId
        }
      }

      pendingToolCalls = []

      for (const toolCall of modelResponse.toolCalls) {
        if (abortController.signal.aborted) break

        runtime.toolCallCount += 1
        let persistedToolCallId: string | undefined

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
            throw new TaskTerminalError({
              status: 'failed',
              assistantMessageId,
              message: err.message,
              errorCode: err.code,
            })
          }
          throw err
        }

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

          taskController.updateTaskStatus(taskId, 'waiting_permission')

          operationLogRepo.create({
            task_id: taskId,
            conversation_id: conversationId,
            log_type: 'permission',
            level: 'info',
            message: `等待用户审批: ${toolCall.name}`,
            details: `请求ID: ${requestId}`,
          })

          const approved = await registerPermissionResolver(requestId, taskId)

          if (abortController.signal.aborted) {
            throw new TaskTerminalError({
              status: 'stopped',
              assistantMessageId,
              message: '任务已被用户停止',
            })
          }

          taskController.updateTaskStatus(taskId, 'running')

          if (!approved) {
            const rejectedToolCallId = persistedToolCallId ?? toolCallId
            toolCallRepo.updateError(rejectedToolCallId, 'PERMISSION_REJECTED', `用户拒绝执行工具 "${toolCall.name}"`)
            operationLogRepo.create({
              task_id: taskId,
              conversation_id: conversationId,
              log_type: 'permission',
              level: 'warn',
              message: `用户拒绝执行: ${toolCall.name}`,
            })

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

          persistedToolCallId = toolCallId
          operationLogRepo.create({
            task_id: taskId,
            conversation_id: conversationId,
            log_type: 'permission',
            level: 'info',
            message: `用户批准执行: ${toolCall.name}`,
          })
        }

        taskController.updateTaskStatus(taskId, 'executing_tool')
        taskEventBus.emit({
          type: 'tool:started',
          taskId,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
        })

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

        taskController.updateTaskStatus(taskId, 'running')
      }

      if (abortController.signal.aborted) {
        throw new TaskTerminalError({
          status: 'stopped',
          assistantMessageId,
          message: '任务已被用户停止',
        })
      }

      continue
    }

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
      throw new TaskTerminalError({
        status: 'failed',
        assistantMessageId,
        message: `连续失败 ${runtime.failureCount} 次: ${modelResponse.reason}`,
        errorCode: 'MODEL_RESPONSE_INVALID',
      })
    }
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
    permissionMode: runtime.permissionMode,
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

export async function finishTask(
  runtime: RuntimeContext,
  status: TaskStatus,
  assistantMessageId: string,
  message?: string,
  extra?: { errorCode?: string; errorMessage?: string }
): Promise<void> {
  const { taskId, conversationId } = runtime

  if (message && (status === 'stopped' || status === 'failed')) {
    const currentContent = messageRepo.getById(assistantMessageId)?.content || ''
    if (!currentContent.includes(message)) {
      const note = status === 'stopped' ? `\n\n> ⏹ ${message}` : `\n\n> ❌ ${message}`
      messageRepo.updateContent(assistantMessageId, currentContent + note)
    }
  }

  messageRepo.setStreaming(assistantMessageId, 0)
  taskRepo.updateMessageLinks(taskId, { assistantMessageId })
  taskController.updateTaskStatus(taskId, status, {
    errorCode: extra?.errorCode,
    errorMessage: extra?.errorMessage,
  })

  operationLogRepo.create({
    task_id: taskId,
    conversation_id: conversationId,
    log_type: 'task_finished',
    level: status === 'completed' ? 'info' : status === 'failed' ? 'error' : 'warn',
    message: message || `任务${status === 'completed' ? '完成' : status === 'stopped' ? '已停止' : '失败'}`,
  })

  if (status === 'completed') {
    taskEventBus.emit({ type: 'task:completed', taskId })
  } else if (status === 'failed') {
    taskEventBus.emit({ type: 'task:failed', taskId, error: extra?.errorMessage || message || '任务失败' })
  } else if (status === 'stopped') {
    taskEventBus.emit({ type: 'task:stopped', taskId })
  }

  rejectAllPendingPermissions(taskId)
  memoryService.refreshConversationSummary(conversationId)
  if (runtime.workspaceId) {
    memoryService.refreshWorkspaceRuleSummary(runtime.workspaceId)
  }
  taskController.cleanup(taskId)
}

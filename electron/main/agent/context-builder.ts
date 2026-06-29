/**
 * Context Builder - 上下文构建
 * 构建发送给模型的上下文（系统提示词 + 历史 + 工具列表 + 工具结果）
 */
import type { ChatMessage } from '../providers/model-provider'
import type { ToolDefinition, ModelToolCall, ToolExecutionResult } from '../tools/agent-tool.types'
import type { PermissionMode } from '../../shared/types'
import { buildSystemPrompt } from './system-prompt'
import { toolRegistry } from '../tools/tool-registry'
import { MessageRepository } from '../database/repositories/message.repository'
import { MessageAttachmentRepository } from '../database/repositories/message-attachment.repository'
import { toAttachmentContentParts } from '../services/attachment-utils'
import { MemoryService } from '../services/memory.service'
import { analyzeConversationCorrection, buildCorrectionNotice } from './conversation-corrections'
import { summarizePendingToolFacts } from './execution-facts'

const messageRepo = new MessageRepository()
const attachmentRepo = new MessageAttachmentRepository()
const memoryService = new MemoryService()

/** 上下文消息（扩展 ChatMessage 支持工具调用） */
export interface ContextMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

/** 上下文构建选项 */
export interface BuildContextOptions {
  taskId: string
  conversationId: string
  workspaceId?: string | null
  providerType: string
  permissionMode: PermissionMode
  workspaceName?: string
  workspaceRootName?: string
  userContent: string
  implementationPrompt?: string
  collaboratorNotes?: Partial<Record<'research' | 'memory', string>>
  /** 上一轮的工具调用和结果 */
  pendingToolCalls?: Array<{
    toolCall: ModelToolCall
    result: ToolExecutionResult
  }>
}

/** 最大历史消息数 */
const MAX_HISTORY_MESSAGES = 20

/**
 * 构建模型请求上下文
 */
export function buildContext(options: BuildContextOptions): {
  messages: ContextMessage[]
  tools: ToolDefinition[]
} {
  const {
    permissionMode,
    workspaceName,
    workspaceRootName,
    userContent,
    pendingToolCalls,
  } = options

  // 1. 系统提示词
  const systemPrompt = buildSystemPrompt({
    permissionMode,
    workspaceId: options.workspaceId ?? null,
    workspaceName,
    workspaceRootName,
    agentRole: 'implementation',
    agentPromptOverride: options.implementationPrompt,
  })

  const messages: ContextMessage[] = [
    { role: 'system', content: systemPrompt },
  ]

  const conversationSummary = memoryService.getConversationSummary(options.conversationId)
  if (conversationSummary?.summary) {
    messages.push({
      role: 'system',
      content: `会话摘要记忆：\n${conversationSummary.summary}`,
    })
  }

  if (options.collaboratorNotes?.research) {
    messages.push({
      role: 'system',
      content: `资料整理 Agent 内部简报：\n${options.collaboratorNotes.research}`,
    })
  }

  if (options.collaboratorNotes?.memory) {
    messages.push({
      role: 'system',
      content: `规则记忆 Agent 内部简报：\n${options.collaboratorNotes.memory}`,
    })
  }

  const recentMessagesForSignal = messageRepo.getRecentByConversationId(options.conversationId, 8)
  const correctionSignal = analyzeConversationCorrection(userContent, recentMessagesForSignal)
  const correctionNotice = buildCorrectionNotice(correctionSignal)
  if (correctionNotice) {
    messages.push({
      role: 'system',
      content: correctionNotice,
    })
  }

  const pendingFactNotice = summarizePendingToolFacts(pendingToolCalls)
  if (pendingFactNotice) {
    messages.push({
      role: 'system',
      content: pendingFactNotice,
    })
  }

  // 2. 会话历史
  const recentHistory = messageRepo.getRecentByConversationId(options.conversationId, MAX_HISTORY_MESSAGES)
  const attachments = attachmentRepo.getByMessageIds(recentHistory.map((message) => message.id))
  const attachmentsByMessage = new Map<string, typeof attachments>()
  for (const attachment of attachments) {
    const bucket = attachmentsByMessage.get(attachment.message_id) ?? []
    bucket.push(attachment)
    attachmentsByMessage.set(attachment.message_id, bucket)
  }

  const lastAssistantMessage = [...recentHistory]
    .reverse()
    .find((message) => message.role === 'assistant' && message.content?.trim())

  for (const msg of recentHistory) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      // 跳过空内容的 assistant 消息
      if (msg.role === 'assistant' && (!msg.content || msg.content.trim() === '')) {
        continue
      }
      const messageAttachments = attachmentsByMessage.get(msg.id) ?? []
      if (msg.role === 'user' && messageAttachments.length > 0) {
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: msg.content },
            ...toAttachmentContentParts(messageAttachments, options.providerType),
          ] as any,
        })
      } else {
        const content =
          correctionSignal.deniesPriorAssistantResult &&
          msg.role === 'assistant' &&
          msg.id === lastAssistantMessage?.id
            ? `【注意：用户随后否认或纠正了这条 assistant 的执行结论；其中关于已完成/已修改/已写入的说法不能当事实。】\n${msg.content}`
            : msg.content
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content,
        })
      }
    }
  }

  // 3. 当前任务用户消息（如果不在历史中）
  // 历史消息已经包含了用户消息（因为消息在创建任务前已保存）
  // 所以这里不需要再添加

  // 4. 工具调用历史（上一轮的工具调用和结果）
  if (pendingToolCalls && pendingToolCalls.length > 0) {
    // 添加 assistant 的工具调用消息
    const assistantToolCalls = pendingToolCalls.map((p) => ({
      id: p.toolCall.id,
      type: 'function' as const,
      function: {
        name: p.toolCall.name,
        arguments: JSON.stringify(p.toolCall.arguments ?? {}),
      },
    }))

    messages.push({
      role: 'assistant',
      content: '',
      tool_calls: assistantToolCalls,
    })

    // 添加每个工具的结果
    for (const p of pendingToolCalls) {
      let resultContent: string
      if (p.result.ok) {
        resultContent = JSON.stringify({
          ok: true,
          tool: p.result.tool,
          result: p.result.result,
          truncated: p.result.truncated ?? false,
        })
      } else {
        // 如果是权限拒绝，在错误信息中明确说明
        const isPermissionRejected = p.result.error?.code === 'PERMISSION_REJECTED'
        resultContent = JSON.stringify({
          ok: false,
          tool: p.result.tool,
          error: p.result.error,
          ...(isPermissionRejected ? { hint: '用户拒绝了此操作，请换用其他方法或向用户说明原因' } : {}),
        })
      }

      messages.push({
        role: 'tool',
        content: resultContent,
        tool_call_id: p.toolCall.id,
      })
    }
  }

  // 5. 工具列表
  const tools = toolRegistry.getToolDefinitions()

  return { messages, tools }
}

/**
 * 将 ContextMessage 转换为 DeepSeek API 格式
 */
export function toApiMessages(messages: ContextMessage[]): any[] {
  return messages.map((m) => {
    const result: any = { role: m.role, content: m.content }
    if (m.tool_calls) {
      result.tool_calls = m.tool_calls
    }
    if (m.tool_call_id) {
      result.tool_call_id = m.tool_call_id
    }
    return result
  })
}

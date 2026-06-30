import { MessageRepository } from '../database/repositories/message.repository'
import { MessageAttachmentRepository } from '../database/repositories/message-attachment.repository'
import { ConversationRepository } from '../database/repositories/conversation.repository'
import { buildSystemPrompt } from '../agent/system-prompt'
import { throttle } from '../utils/throttle'
import { streamChatWithCallbacks } from '../utils/stream-chat'
import type { ProviderConfig, ModelRequest, ChatMessage } from '../providers/model-provider'
import type { AttachmentInput, ChatMessageVO, ChatDeltaEvent, ChatDoneEvent, ChatErrorEvent } from '../../shared/types'
import type { IpcMainInvokeEvent } from 'electron'
import { normalizeAttachmentInput, readAttachmentSize, toAttachmentContentParts } from './attachment-utils'
import { MemoryService } from './memory.service'
import { getProviderCapabilities } from '../providers/provider-capabilities'
import { AiSettingsService } from './ai-settings.service'
import { SkillService, skillRepo } from './skill.service'

const messageRepo = new MessageRepository()
const attachmentRepo = new MessageAttachmentRepository()
const conversationRepo = new ConversationRepository()
const memoryService = new MemoryService()
const aiSettingsService = new AiSettingsService()
const skillService = new SkillService()

// 当前活跃的 AbortController，按 conversationId 索引
const activeControllers = new Map<string, AbortController>()

/** 最大上下文消息数 */
const MAX_CONTEXT_MESSAGES = 50

export class ChatService {
  /**
   * 发送消息并开始流式回复
   * 返回用户消息的 VO，流式事件通过 sender 推送
   */
  async sendMessage(
    event: IpcMainInvokeEvent,
    conversationId: string,
    content: string,
    attachments: AttachmentInput[] = []
  ): Promise<ChatMessageVO> {
    if (!conversationId || typeof conversationId !== 'string') {
      throw new Error('conversationId 不能为空')
    }
    if (!content || typeof content !== 'string' || !content.trim()) {
      throw new Error('消息内容不能为空')
    }

    // 检查是否有正在进行的请求
    if (activeControllers.has(conversationId)) {
      throw new Error('当前会话正在生成中，请先停止')
    }

    // 获取会话
    const conversation = conversationRepo.getById(conversationId)
    if (!conversation) {
      throw new Error('会话不存在')
    }

    const skillRefs = skillService.resolveRefs(content.trim())
    if (skillRefs.missing.length > 0) {
      throw new Error(`未找到 Skill：${skillRefs.missing.join(', ')}。请先安装或刷新扫描。`)
    }
    if (skillRefs.disabled.length > 0) {
      throw new Error(`Skill 已禁用：${skillRefs.disabled.join(', ')}。请先在设置中启用。`)
    }
    if (skillRefs.refs.length > 3) {
      throw new Error('单轮最多引用 3 个 Skill，请减少后重试。')
    }

    // 获取最新 sequence_no
    const latestMsg = messageRepo.getLatestByConversationId(conversationId)
    const nextSeq = (latestMsg?.sequence_no ?? 0) + 1

    // 创建用户消息
    const userMessage = messageRepo.create({
      conversation_id: conversationId,
      role: 'user',
      content: content.trim(),
      sequence_no: nextSeq,
    })
    skillRepo.createMessageRefs(userMessage.id, conversationId, skillRefs.refs)
    if (attachments.length > 0) {
      attachmentRepo.createMany(
        attachments.map((attachment) => {
          const normalized = normalizeAttachmentInput(attachment)
          return {
            message_id: userMessage.id,
            conversation_id: conversationId,
            kind: normalized.kind,
            file_name: normalized.name,
            mime_type: normalized.mimeType ?? null,
            original_path: normalized.path,
            size_bytes: normalized.size ?? readAttachmentSize(normalized.path),
          }
        })
      )
    }
    memoryService.ingestUserMessage(content.trim(), userMessage.id, conversation.workspace_id ?? null)

    // 自动标题：首条消息截断
    if (conversation.title === '新对话') {
      const autoTitle = content.trim().slice(0, 30) + (content.trim().length > 30 ? '...' : '')
      conversationRepo.updateTitle(conversationId, autoTitle)
    }

    const providerConfig = await aiSettingsService.getProviderConfig(conversationId)

    if (attachments.length > 0) {
      const capability = getProviderCapabilities(providerConfig.providerType, providerConfig.model)
      if (!capability.supportsMultimodal) {
        throw new Error('当前模型不支持附件输入，请切换到支持多模态的模型')
      }
    }

    // 创建 Assistant 消息（is_streaming = 1）
    const assistantMessage = messageRepo.create({
      conversation_id: conversationId,
      role: 'assistant',
      content: '',
      content_type: 'markdown',
      sequence_no: nextSeq + 1,
    })
    // 标记为 streaming
    messageRepo.setStreaming(assistantMessage.id, 1)

    // 构建多轮上下文
    const contextMessages = this.buildContext(conversationId, userMessage.id, providerConfig)

    // 创建 AbortController
    const controller = new AbortController()
    activeControllers.set(conversationId, controller)

    // 构建请求
    const modelRequest: ModelRequest = {
      messages: contextMessages,
      temperature: providerConfig.temperature,
      topP: providerConfig.topP,
      maxTokens: providerConfig.maxTokens,
    } as any
    // 将 config 附加到 request 上供 Provider 使用
    modelRequest.config = providerConfig

    // 异步执行流式请求
    this.streamResponse(event, conversationId, assistantMessage.id, modelRequest, controller.signal)

    // 返回用户消息 VO
    return this.toMessageVO(userMessage)
  }

  /**
   * 停止当前生成
   */
  stopGeneration(conversationId: string): void {
    if (!conversationId) return
    const controller = activeControllers.get(conversationId)
    if (controller) {
      controller.abort()
      activeControllers.delete(conversationId)
    }
  }

  /**
   * 获取会话消息列表
   */
  getMessages(conversationId: string): ChatMessageVO[] {
    if (!conversationId) return []
    const messages = messageRepo.getByConversationId(conversationId)
    return messages.map((m) => this.toMessageVO(m))
  }

  /**
   * 分页获取会话消息
   */
  getMessagesPaged(conversationId: string, limit: number = 50, offset: number = 0): ChatMessageVO[] {
    if (!conversationId) return []
    const messages = messageRepo.getByConversationIdPaged(conversationId, limit, offset)
    return messages.map((m) => this.toMessageVO(m))
  }

  /**
   * 获取会话消息总数
   */
  countMessages(conversationId: string): number {
    if (!conversationId) return 0
    return messageRepo.countByConversationId(conversationId)
  }

  /**
   * 流式请求并推送事件
   */
  private async streamResponse(
    event: IpcMainInvokeEvent,
    conversationId: string,
    assistantMessageId: string,
    modelRequest: ModelRequest,
    signal: AbortSignal
  ): Promise<void> {
    let usageTotalTokens: number | null = null
    // 节流推送 delta 事件（50ms 间隔），减少 IPC 通信频率
    const throttledPushDelta = throttle((content: string, delta: string) => {
      // 更新数据库
      messageRepo.updateContent(assistantMessageId, content)
      // 推送到前端
      const deltaEvent: ChatDeltaEvent = {
        messageId: assistantMessageId,
        content,
        delta,
      }
      try {
        event.sender.send('chat:delta', deltaEvent)
      } catch {
        // 窗口可能已关闭
      }
    }, 50)

    try {
      const fullContent = await streamChatWithCallbacks(modelRequest, signal, {
        onDelta: (content, delta) => {
          throttledPushDelta(content, delta)
        },
        onDone: (usage) => {
          usageTotalTokens = usage?.totalTokens ?? usageTotalTokens
          throttledPushDelta.flush()
        },
        onError: (code, message) => {
          throttledPushDelta.flush()
          messageRepo.setStreaming(assistantMessageId, 0)
          const errorEvent: ChatErrorEvent = {
            messageId: assistantMessageId,
            error: { code, message },
          }
          try {
            event.sender.send('chat:error', errorEvent)
          } catch {
            // 窗口可能已关闭
          }
        },
      })

      // 流式完成后更新最终内容
      messageRepo.updateContent(assistantMessageId, fullContent)
      messageRepo.updateTokenCount(assistantMessageId, usageTotalTokens)
      messageRepo.setStreaming(assistantMessageId, 0)
      memoryService.refreshConversationSummary(conversationId)
      const doneEvent: ChatDoneEvent = { messageId: assistantMessageId }
      try {
        event.sender.send('chat:done', doneEvent)
      } catch {
        // 窗口可能已关闭
      }
    } finally {
      activeControllers.delete(conversationId)
    }
  }

  /**
   * 构建多轮上下文
   */
  private buildContext(conversationId: string, userMessageId: string, providerConfig: ProviderConfig): ChatMessage[] {
    const historyLimit =
      typeof providerConfig.contextMessageLimit === 'number'
        ? Math.max(1, Math.min(200, Math.floor(providerConfig.contextMessageLimit)))
        : MAX_CONTEXT_MESSAGES
    const contextSlice = messageRepo.getRecentByConversationId(conversationId, historyLimit)
    const systemPrompt = buildSystemPrompt({ permissionMode: 'chat' })
    const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }]
    const conversationSummary = memoryService.getConversationSummary(conversationId)
    if (conversationSummary?.summary) {
      messages.push({ role: 'system', content: `会话摘要记忆：\n${conversationSummary.summary}` })
    }
    const referencedSkills = skillRepo.getByMessageId(userMessageId).slice(0, 3)
    for (const skill of referencedSkills) {
      const content = skillService.readSkillContent(skill)
      if (!content) continue
      const skillContent =
        content.length > 6000
          ? `${skill.summary || skill.description || '该 Skill 内容较长，已只注入摘要。'}\n\n注意：完整 Skill 超过当前注入上限。`
          : content
      messages.push({
        role: 'system',
        content: `本轮用户显式引用了 TieX Skill：${skill.name}\n\n${skillContent}`,
      })
    }
    const attachments = attachmentRepo.getByMessageIds(contextSlice.map((message) => message.id))
    const attachmentsByMessage = new Map<string, typeof attachments>()
    for (const attachment of attachments) {
      const bucket = attachmentsByMessage.get(attachment.message_id) ?? []
      bucket.push(attachment)
      attachmentsByMessage.set(attachment.message_id, bucket)
    }

    for (const msg of contextSlice) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        const messageAttachments = attachmentsByMessage.get(msg.id) ?? []
        if (msg.role === 'user' && messageAttachments.length > 0) {
          messages.push({
            role: 'user',
            content: [
              { type: 'text', text: msg.content },
              ...toAttachmentContentParts(messageAttachments, providerConfig.providerType),
            ],
          })
        } else {
          messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content })
        }
      }
    }

    return messages
  }

  /**
   * 转换为前端 VO
   */
  private toMessageVO(msg: any): ChatMessageVO {
    const attachments = attachmentRepo.getByMessageId(msg.id).map((attachment) => ({
      id: attachment.id,
      kind: attachment.kind,
      fileName: attachment.file_name,
      mimeType: attachment.mime_type,
      originalPath: attachment.original_path,
      sizeBytes: attachment.size_bytes,
    }))

    return {
      id: msg.id,
      conversationId: msg.conversation_id,
      taskId: msg.task_id ?? null,
      role: msg.role,
      content: msg.content,
      contentType: msg.content_type,
      attachments,
      sequenceNo: msg.sequence_no,
      isStreaming: msg.is_streaming ?? 0,
      createdAt: msg.created_at,
    }
  }

  /**
   * 取消所有进行中的请求（应用退出时调用）
   */
  abortAll(): void {
    for (const [_, controller] of activeControllers) {
      controller.abort()
    }
    activeControllers.clear()
  }
}

import { MessageRepository } from '../database/repositories/message.repository'
import { ConversationRepository } from '../database/repositories/conversation.repository'
import { ProviderRepository } from '../database/repositories/provider.repository'
import { buildSystemPrompt } from '../agent/system-prompt'
import { safeStorage } from 'electron'
import { throttle } from '../utils/throttle'
import { streamChatWithCallbacks } from '../utils/stream-chat'
import type { ProviderConfig, ModelRequest, ChatMessage } from '../providers/model-provider'
import type { ChatMessageVO, ChatDeltaEvent, ChatDoneEvent, ChatErrorEvent } from '../../shared/types'
import type { IpcMainInvokeEvent } from 'electron'

const messageRepo = new MessageRepository()
const conversationRepo = new ConversationRepository()
const providerRepo = new ProviderRepository()

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
    content: string
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

    // 自动标题：首条消息截断
    if (conversation.title === '新对话') {
      const autoTitle = content.trim().slice(0, 30) + (content.trim().length > 30 ? '...' : '')
      conversationRepo.updateTitle(conversationId, autoTitle)
    }

    // 获取 Provider 配置
    const providerId = conversation.provider_id
    let providerConfig: ProviderConfig

    if (providerId) {
      providerConfig = await this.getProviderConfig(providerId)
    } else {
      // 使用默认 Provider
      const defaultProvider = providerRepo.getDefault()
      if (!defaultProvider) {
        throw new Error('未配置模型服务商，请先在设置中配置')
      }
      providerConfig = await this.getProviderConfig(defaultProvider.id)
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
    const contextMessages = this.buildContext(conversationId)

    // 创建 AbortController
    const controller = new AbortController()
    activeControllers.set(conversationId, controller)

    // 构建请求
    const modelRequest: ModelRequest = {
      messages: contextMessages,
      temperature: providerConfig.temperature,
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
        onDone: () => {
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
      messageRepo.setStreaming(assistantMessageId, 0)
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
  private buildContext(conversationId: string): ChatMessage[] {
    const allMessages = messageRepo.getByConversationId(conversationId)
    const systemPrompt = buildSystemPrompt({ permissionMode: 'chat' })
    const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }]

    // 取最近的 MAX_CONTEXT_MESSAGES 条消息
    const contextSlice = allMessages.slice(-MAX_CONTEXT_MESSAGES)

    for (const msg of contextSlice) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content })
      }
    }

    return messages
  }

  /**
   * 获取解密后的 Provider 配置
   */
  private async getProviderConfig(providerId: string): Promise<ProviderConfig> {
    const provider = providerRepo.getById(providerId)
    if (!provider) {
      throw new Error('模型服务商配置不存在')
    }

    // 解密 API Key
    let apiKey = ''
    const encrypted = providerRepo.getEncryptedApiKey(providerId)
    if (encrypted) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('系统不支持安全存储')
      }
      apiKey = safeStorage.decryptString(encrypted)
    }

    return {
      id: provider.id,
      name: provider.name,
      providerType: provider.provider_type,
      baseUrl: provider.base_url,
      model: provider.model_name,
      apiKey,
      temperature: provider.temperature ?? undefined,
      maxTokens: provider.max_tokens ?? undefined,
      timeoutMs: provider.timeout_ms,
    }
  }

  /**
   * 转换为前端 VO
   */
  private toMessageVO(msg: any): ChatMessageVO {
    return {
      id: msg.id,
      conversationId: msg.conversation_id,
      taskId: msg.task_id ?? null,
      role: msg.role,
      content: msg.content,
      contentType: msg.content_type,
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

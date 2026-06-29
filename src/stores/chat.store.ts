import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AttachmentInput, MessageAttachmentInfo } from '@/types/global'

export interface ChatMessage {
  id: string
  conversationId: string
  role: string
  content: string
  contentType: string
  attachments?: MessageAttachmentInfo[]
  sequenceNo: number
  isStreaming: number
  createdAt: string
  taskId?: string | null
  error?: {
    code: string
    message: string
  }
}

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([])
  const isStreaming = ref(false)
  const currentConversationId = ref<string | null>(null)
  const error = ref<{ code: string; message: string } | null>(null)
  const scrollToBottomRequest = ref(0)

  // 分页状态
  const totalCount = ref(0)
  const pageSize = 50
  const hasMoreMessages = ref(false)

  // 流式事件清理函数
  let cleanupDelta: (() => void) | null = null
  let cleanupDone: (() => void) | null = null
  let cleanupError: (() => void) | null = null
  // Agent 任务事件清理函数
  let cleanupTaskEvent: (() => void) | null = null

  function setupStreamListeners() {
    if (!window.tiex) return

    // 清理旧的监听器
    removeStreamListeners()

    cleanupDelta = window.tiex.chat.onDelta((data: any) => {
      const idx = messages.value.findIndex((m) => m.id === data.messageId)
      if (idx !== -1) {
        messages.value[idx].content = data.content
      } else {
        // 新的 assistant 消息，添加到列表
        messages.value.push({
          id: data.messageId,
          conversationId: currentConversationId.value || '',
          role: 'assistant',
          content: data.content,
          contentType: 'markdown',
          attachments: [],
          sequenceNo: messages.value.length,
          isStreaming: 1,
          createdAt: new Date().toISOString(),
        })
      }
    })

    cleanupDone = window.tiex.chat.onDone((data: any) => {
      const idx = messages.value.findIndex((m) => m.id === data.messageId)
      if (idx !== -1) {
        messages.value[idx].isStreaming = 0
      }
      isStreaming.value = false
    })

    cleanupError = window.tiex.chat.onError((data: any) => {
      const idx = messages.value.findIndex((m) => m.id === data.messageId)
      if (idx !== -1) {
        messages.value[idx].isStreaming = 0
        messages.value[idx].error = data.error
      }
      isStreaming.value = false
      error.value = data.error
    })
  }

  /**
   * 设置 Agent 任务事件监听
   * Agent 模式下，消息增量通过 task:event 的 message:delta 推送
   */
  function setupTaskStreamListeners() {
    if (!window.tiex) return
    if (cleanupTaskEvent) return

    cleanupTaskEvent = window.tiex.task.onEvent((event: any) => {
      handleTaskStreamEvent(event)
    })
  }

  /**
   * 处理 Agent 任务流式事件
   */
  function handleTaskStreamEvent(event: any) {
    switch (event.type) {
      case 'message:delta': {
        const messageId = event.messageId
        if (!messageId) break

        const idx = messages.value.findIndex((m) => m.id === messageId)
        if (idx !== -1) {
          messages.value[idx].content = event.content
          messages.value[idx].isStreaming = 1
        } else {
          messages.value.push({
            id: messageId,
            conversationId: currentConversationId.value || '',
            role: 'assistant',
            content: event.content,
            contentType: 'markdown',
            attachments: [],
            sequenceNo: messages.value.length,
            isStreaming: 1,
            createdAt: new Date().toISOString(),
            taskId: event.taskId,
          })
        }
        break
      }
      case 'task:completed':
      case 'task:failed':
      case 'task:stopped': {
        // 任务结束，停止所有流式状态
        for (const m of messages.value) {
          if (m.isStreaming === 1) {
            m.isStreaming = 0
          }
        }
        isStreaming.value = false
        removeTaskStreamListeners()
        if (currentConversationId.value) {
          void loadMessages(currentConversationId.value)
        }
        break
      }
    }
  }

  function removeStreamListeners() {
    cleanupDelta?.()
    cleanupDelta = null
    cleanupDone?.()
    cleanupDone = null
    cleanupError?.()
    cleanupError = null
  }

  function removeTaskStreamListeners() {
    cleanupTaskEvent?.()
    cleanupTaskEvent = null
  }

  async function loadMessages(conversationId: string) {
    if (!window.tiex) return

    // 切换会话时清理
    if (currentConversationId.value !== conversationId) {
      removeStreamListeners()
      removeTaskStreamListeners()
      isStreaming.value = false
      error.value = null
    }

    currentConversationId.value = conversationId

    try {
      // 获取消息总数
      totalCount.value = await window.tiex.chat.countMessages(conversationId)

      // 计算偏移量：加载最新的 pageSize 条消息
      const offset = Math.max(0, totalCount.value - pageSize)
      const result = await window.tiex.chat.getMessagesPaged(conversationId, pageSize, offset)

      messages.value = result.map((m: any) => ({
        id: m.id,
        conversationId: m.conversationId,
        taskId: m.taskId ?? null,
        role: m.role,
        content: m.content,
        contentType: m.contentType,
        attachments: m.attachments ?? [],
        sequenceNo: m.sequenceNo,
        isStreaming: m.isStreaming,
        createdAt: m.createdAt,
      }))

      // 更新是否有更多消息
      hasMoreMessages.value = offset > 0

      // 如果有正在流式的消息，恢复监听
      const hasStreaming = messages.value.some((m) => m.isStreaming === 1)
      isStreaming.value = hasStreaming
      if (hasStreaming) {
        setupTaskStreamListeners()
      } else {
        removeTaskStreamListeners()
      }
    } catch (err) {
      console.error('Failed to load messages:', err)
    }
  }

  /**
   * 加载更多历史消息（向上翻页）
   */
  async function loadMoreMessages() {
    if (!window.tiex || !currentConversationId.value || !hasMoreMessages.value) return

    try {
      const currentCount = messages.value.length
      // 计算剩余未加载的消息数
      const remainingOffset = totalCount.value - currentCount - pageSize
      const offset = Math.max(0, remainingOffset)
      const limit = Math.min(pageSize, totalCount.value - currentCount)

      if (limit <= 0) {
        hasMoreMessages.value = false
        return
      }

      const result = await window.tiex.chat.getMessagesPaged(
        currentConversationId.value,
        limit,
        offset
      )

      const olderMessages = result.map((m: any) => ({
        id: m.id,
        conversationId: m.conversationId,
        taskId: m.taskId ?? null,
        role: m.role,
        content: m.content,
        contentType: m.contentType,
        attachments: m.attachments ?? [],
        sequenceNo: m.sequenceNo,
        isStreaming: m.isStreaming,
        createdAt: m.createdAt,
      }))

      // 将旧消息插入到前面
      messages.value = [...olderMessages, ...messages.value]
      hasMoreMessages.value = offset > 0
    } catch (err) {
      console.error('Failed to load more messages:', err)
    }
  }

  /**
   * 普通聊天模式发送消息（阶段四保留）
   */
  async function sendMessage(conversationId: string, content: string, attachments: AttachmentInput[] = []) {
    if (!window.tiex) return
    if (isStreaming.value) return

    error.value = null
    isStreaming.value = true
    const tempUserMessageId = `temp-user-${Date.now()}`

    messages.value.push({
      id: tempUserMessageId,
      conversationId,
      role: 'user',
      content,
      contentType: 'text',
      attachments: attachments.map((attachment, index) => ({
        id: `temp-attachment-${index}`,
        kind: attachment.mimeType?.startsWith('image/') ? 'image' : 'file',
        fileName: attachment.name,
        mimeType: attachment.mimeType ?? null,
        originalPath: attachment.path,
        sizeBytes: attachment.size ?? null,
      })),
      sequenceNo: messages.value.length,
      isStreaming: 0,
      createdAt: new Date().toISOString(),
    })
    scrollToBottomRequest.value += 1

    // 确保监听器已设置
    setupStreamListeners()

    try {
      const userMessage = await window.tiex.chat.send(conversationId, content, attachments)
      const tempIndex = messages.value.findIndex((message) => message.id === tempUserMessageId)
      const nextMessage = {
        id: userMessage.id,
        conversationId: userMessage.conversationId,
        taskId: userMessage.taskId ?? null,
        role: userMessage.role,
        content: userMessage.content,
        contentType: userMessage.contentType,
        attachments: userMessage.attachments ?? [],
        sequenceNo: userMessage.sequenceNo,
        isStreaming: 0,
        createdAt: userMessage.createdAt,
      }
      if (tempIndex !== -1) {
        messages.value[tempIndex] = nextMessage
      } else {
        messages.value.push(nextMessage)
      }
    } catch (err: any) {
      messages.value = messages.value.filter((message) => message.id !== tempUserMessageId)
      isStreaming.value = false
      error.value = {
        code: 'SEND_ERROR',
        message: err.message || '发送消息失败',
      }
    }
  }

  /**
   * Agent 模式发送消息（阶段五）
   * 通过 task:start 启动 Agent 任务
   */
  async function sendAgentMessage(
    conversationId: string,
    content: string,
    options?: { workspaceId?: string | null; attachments?: AttachmentInput[] }
  ) {
    if (!window.tiex) return
    if (isStreaming.value) return

    error.value = null
    isStreaming.value = true
    const tempUserMessageId = `temp-user-${Date.now()}`

    messages.value.push({
      id: tempUserMessageId,
      conversationId,
      role: 'user',
      content,
      contentType: 'text',
      attachments: options?.attachments?.map((attachment, index) => ({
        id: `temp-attachment-${index}`,
        kind: attachment.mimeType?.startsWith('image/') ? 'image' : 'file',
        fileName: attachment.name,
        mimeType: attachment.mimeType ?? null,
        originalPath: attachment.path,
        sizeBytes: attachment.size ?? null,
      })) ?? [],
      sequenceNo: messages.value.length,
      isStreaming: 0,
      createdAt: new Date().toISOString(),
    })
    scrollToBottomRequest.value += 1

    // 设置任务事件监听
    setupTaskStreamListeners()

    try {
      // 启动 Agent 任务
      const result = await window.tiex.task.start({
        conversationId,
        content,
        attachments: options?.attachments ?? [],
        workspaceId: options?.workspaceId ?? null,
      })

      const tempIndex = messages.value.findIndex((message) => message.id === tempUserMessageId)
      if (tempIndex !== -1) {
        messages.value[tempIndex] = {
          ...messages.value[tempIndex],
          id: result.userMessageId,
        }
      }

      return result.taskId
    } catch (err: any) {
      messages.value = messages.value.filter((message) => message.id !== tempUserMessageId)
      isStreaming.value = false
      error.value = {
        code: 'TASK_START_ERROR',
        message: err.message || '启动任务失败',
      }
      throw err
    }
  }

  /**
   * 停止当前生成（兼容普通聊天和 Agent 模式）
   */
  async function stopGeneration(conversationId: string, taskId?: string) {
    if (!window.tiex) return
    try {
      if (taskId) {
        // Agent 模式
        await window.tiex.task.stop(taskId)
      } else {
        // 普通聊天模式
        await window.tiex.chat.stop(conversationId)
      }
      isStreaming.value = false
    } catch (err) {
      console.error('Failed to stop generation:', err)
    }
  }

  function clearMessages() {
    messages.value = []
    isStreaming.value = false
    error.value = null
    totalCount.value = 0
    hasMoreMessages.value = false
    removeStreamListeners()
    removeTaskStreamListeners()
  }

  return {
    messages,
    isStreaming,
    currentConversationId,
    error,
    scrollToBottomRequest,
    totalCount,
    hasMoreMessages,
    loadMessages,
    loadMoreMessages,
    sendMessage,
    sendAgentMessage,
    stopGeneration,
    clearMessages,
    setupStreamListeners,
    removeStreamListeners,
    setupTaskStreamListeners,
    removeTaskStreamListeners,
  }
})

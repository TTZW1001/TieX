import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ChatMessage {
  id: string
  conversationId: string
  role: string
  content: string
  contentType: string
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
        // Agent 模式下的消息增量
        // 这里 event.content 是累积的完整内容，event.delta 是增量
        // 我们需要找到当前正在流式的 assistant 消息并更新
        const streamingMsg = messages.value.find((m) => m.isStreaming === 1 && m.role === 'assistant')
        if (streamingMsg) {
          streamingMsg.content = event.content
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
        // 重新加载消息以获取最终状态
        if (currentConversationId.value) {
          loadMessages(currentConversationId.value)
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
        role: m.role,
        content: m.content,
        contentType: m.contentType,
        sequenceNo: m.sequenceNo,
        isStreaming: m.isStreaming,
        createdAt: m.createdAt,
        taskId: m.taskId,
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
        role: m.role,
        content: m.content,
        contentType: m.contentType,
        sequenceNo: m.sequenceNo,
        isStreaming: m.isStreaming,
        createdAt: m.createdAt,
        taskId: m.taskId,
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
  async function sendMessage(conversationId: string, content: string) {
    if (!window.tiex) return
    if (isStreaming.value) return

    error.value = null
    isStreaming.value = true

    // 确保监听器已设置
    setupStreamListeners()

    try {
      // 先在前端添加用户消息
      const userMessage = await window.tiex.chat.send(conversationId, content)
      messages.value.push({
        id: userMessage.id,
        conversationId: userMessage.conversationId,
        role: userMessage.role,
        content: userMessage.content,
        contentType: userMessage.contentType,
        sequenceNo: userMessage.sequenceNo,
        isStreaming: 0,
        createdAt: userMessage.createdAt,
      })
    } catch (err: any) {
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
    options?: { workspaceId?: string | null }
  ) {
    if (!window.tiex) return
    if (isStreaming.value) return

    error.value = null
    isStreaming.value = true

    // 设置任务事件监听
    setupTaskStreamListeners()

    try {
      // 启动 Agent 任务
      const result = await window.tiex.task.start({
        conversationId,
        content,
        workspaceId: options?.workspaceId ?? null,
      })

      // 添加用户消息占位（实际用户消息由主进程创建）
      // 主进程会在 task:start 中创建用户消息和 assistant 消息
      // 我们通过 loadMessages 重新加载来获取这些消息
      // 但为了即时反馈，先在前端添加用户消息
      messages.value.push({
        id: `temp-user-${Date.now()}`,
        conversationId,
        role: 'user',
        content,
        contentType: 'text',
        sequenceNo: messages.value.length,
        isStreaming: 0,
        createdAt: new Date().toISOString(),
      })

      // 添加 assistant 消息占位（等待 message:delta 事件填充）
      messages.value.push({
        id: `temp-assistant-${result.taskId}`,
        conversationId,
        role: 'assistant',
        content: '',
        contentType: 'markdown',
        sequenceNo: messages.value.length,
        isStreaming: 1,
        createdAt: new Date().toISOString(),
        taskId: result.taskId,
      })

      return result.taskId
    } catch (err: any) {
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

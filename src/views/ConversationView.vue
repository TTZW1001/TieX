<script setup lang="ts">
import { ref, watch, onMounted, nextTick, computed } from 'vue'
import { useRoute } from 'vue-router'
import { FolderOpen } from 'lucide-vue-next'
import { useChatStore } from '@/stores/chat.store'
import { useConversationStore } from '@/stores/conversation.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { useTaskStore } from '@/stores/task.store'
import type { ChatMessage } from '@/stores/chat.store'
import MessageItem from '@/components/MessageItem.vue'
import ChatComposer from '@/components/ChatComposer.vue'
import ErrorAlert from '@/components/ErrorAlert.vue'
import type { ActivityEntry } from '@/components/ActivityFeedItem.vue'
import TaskMessageBlock from '@/components/TaskMessageBlock.vue'
import type { ProcessStreamItem } from '@/components/ActivityProcessBlock.vue'

const chatStore = useChatStore()
const conversationStore = useConversationStore()
const workspaceStore = useWorkspaceStore()
const taskStore = useTaskStore()
const route = useRoute()
const messagesContainer = ref<HTMLElement | null>(null)
const loadingMore = ref(false)

type FeedItem =
  | { id: string; type: 'message'; createdAt: string; message: typeof chatStore.messages[number] }
  | {
      id: string
      type: 'task-block'
      createdAt: string
      processItems: ProcessStreamItem[]
      summaryMessage: ChatMessage | null
      running: boolean
    }

const activityMeta = computed(() => {
  if (taskStore.isRunning) {
    return {
      label: '任务运行中',
      tone: 'running',
    }
  }

  if (chatStore.isStreaming) {
    return {
      label: '生成中',
      tone: 'running',
    }
  }

  return {
    label: '已就绪',
    tone: 'idle',
  }
})

const activityEntries = computed<ActivityEntry[]>(() => {
  const list: ActivityEntry[] = []
  const currentTask = taskStore.currentTask

  if (currentTask) {
    const status =
      currentTask.status === 'completed'
        ? 'completed'
        : currentTask.status === 'failed'
          ? 'failed'
          : currentTask.status === 'stopped'
            ? 'stopped'
            : 'running'

    list.push({
      id: `task-${currentTask.id}`,
      kind: 'task',
      createdAt: currentTask.createdAt,
      title: currentTask.title || 'Agent 任务',
      status,
      detail: currentTask.errorMessage || undefined,
    })
  }

  for (const request of taskStore.permissionRequests) {
    list.push({
      id: `perm-${request.id}`,
      kind: 'permission',
      createdAt: request.requested_at,
      title: request.title,
      status: request.status === 'pending' ? 'waiting' : request.status === 'approved' ? 'approved' : 'rejected',
      detail: request.reason || request.target || undefined,
      requestId: request.id,
    })
  }

  for (const toolCall of taskStore.toolCalls) {
    const status = taskStore.toolCallStatus.get(toolCall.id)?.status || toolCall.status
    list.push({
      id: `tool-${toolCall.id}`,
      kind: 'tool',
      createdAt: toolCall.created_at,
      title: toolCall.tool_name,
      status: status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : 'running',
      detail: toolCall.error_message || undefined,
    })
  }

  for (const session of Array.from(taskStore.commandSessions.values())) {
    list.push({
      id: `cmd-${session.sessionId}`,
      kind: 'command',
      createdAt: session.startedAt,
      title: session.command || '命令执行',
      status: session.status,
      sessionId: session.sessionId,
    })
  }

  for (const artifact of taskStore.artifacts) {
    list.push({
      id: `artifact-${artifact.id}`,
      kind: 'artifact',
      createdAt: artifact.created_at,
      title: artifact.name,
      status: 'completed',
      artifactId: artifact.id,
    })
  }

  return list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
})

const currentTaskAssistantMessages = computed(() => {
  const taskId = taskStore.currentTask?.id
  if (!taskId) return [] as ChatMessage[]

  return chatStore.messages.filter(
    (message) => message.role === 'assistant' && message.taskId === taskId,
  )
})

const taskSummaryMessage = computed<ChatMessage | null>(() => {
  const assistantMessages = currentTaskAssistantMessages.value.filter((message) => message.content.trim())
  if (!assistantMessages.length) return null
  if (taskStore.isRunning || chatStore.isStreaming) return null
  return assistantMessages[assistantMessages.length - 1] ?? null
})

const taskProcessItems = computed<ProcessStreamItem[]>(() => {
  const summaryMessageId = taskSummaryMessage.value?.id ?? null
  const noteItems: ProcessStreamItem[] = currentTaskAssistantMessages.value
    .filter((message) => message.id !== summaryMessageId)
    .filter((message) => message.content.trim())
    .map((message) => ({
      id: `note-${message.id}`,
      kind: 'note' as const,
      createdAt: message.createdAt,
      content: message.content,
      streaming: message.isStreaming === 1,
    }))

  const activityItems: ProcessStreamItem[] = activityEntries.value.map((entry) => ({
    id: `activity-${entry.id}`,
    kind: 'activity' as const,
    createdAt: entry.createdAt,
    entry,
  }))

  return [...noteItems, ...activityItems].sort((a, b) => {
    const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    if (timeDiff !== 0) return timeDiff
    if (a.kind === b.kind) return 0
    return a.kind === 'note' ? -1 : 1
  })
})

const mergedFeed = computed<FeedItem[]>(() => {
  const currentTaskId = taskStore.currentTask?.id ?? null
  const messageItems: FeedItem[] = chatStore.messages
    .filter((message) => !(currentTaskId && message.role === 'assistant' && message.taskId === currentTaskId))
    .map((message) => ({
    id: `msg-${message.id}`,
    type: 'message',
    createdAt: message.createdAt,
    message,
  }))

  const hasTaskBlock = !!currentTaskId && (taskProcessItems.value.length > 0 || !!taskSummaryMessage.value)
  if (!hasTaskBlock) return messageItems

  const taskMessages = currentTaskAssistantMessages.value
  const firstTaskMessage = taskMessages[0] ?? taskSummaryMessage.value
  const insertIndex = firstTaskMessage
    ? messageItems.findIndex((item) => new Date(item.createdAt).getTime() > new Date(firstTaskMessage.createdAt).getTime())
    : -1

  const taskBlock: FeedItem = {
      id: `activity-group-${currentTaskId ?? 'current'}`,
      type: 'task-block',
      createdAt: firstTaskMessage?.createdAt ?? taskProcessItems.value[0]?.createdAt ?? new Date().toISOString(),
      processItems: taskProcessItems.value,
      summaryMessage: taskSummaryMessage.value,
      running: taskStore.isRunning || chatStore.isStreaming,
    }

  if (insertIndex === -1) {
    return [...messageItems, taskBlock]
  }

  return [...messageItems.slice(0, insertIndex), taskBlock, ...messageItems.slice(insertIndex)]
})

async function scrollToBottom() {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

watch(
  () => route.params.id,
  async (newId) => {
    if (newId && typeof newId === 'string') {
      conversationStore.setCurrentConversation(newId)
      await chatStore.loadMessages(newId)
      await taskStore.loadConversationTasks(newId)
      const latestTask = taskStore.conversationTasks[0] ?? null
      await taskStore.setCurrentTask(latestTask?.id ?? null)
      scrollToBottom()
    }
  },
  { immediate: true }
)

watch(
  () => chatStore.messages.length,
  () => scrollToBottom()
)

watch(
  () => {
    const msgs = chatStore.messages
    if (msgs.length === 0) return ''
    return msgs[msgs.length - 1].content
  },
  () => scrollToBottom()
)

async function loadMore() {
  if (loadingMore.value) return
  loadingMore.value = true
  const container = messagesContainer.value
  const prevScrollHeight = container?.scrollHeight ?? 0

  try {
    await chatStore.loadMoreMessages()
    await nextTick()
    if (container) {
      container.scrollTop = container.scrollHeight - prevScrollHeight
    }
  } finally {
    loadingMore.value = false
  }
}

onMounted(() => {
  scrollToBottom()
  if (!workspaceStore.hasWorkspace) {
    workspaceStore.loadWorkspaces()
  }
})
</script>

<template>
  <div class="chat-layout">
    <div class="chat-main">
      <div class="session-strip" v-if="workspaceStore.hasWorkspace">
        <div class="session-pill activity-pill" :class="activityMeta.tone">
          <span class="status-dot" v-if="activityMeta.tone === 'running'" />
          <span>{{ activityMeta.label }}</span>
        </div>
        <div class="session-pill workspace-tag">
          <FolderOpen :size="12" />
          <span>{{ workspaceStore.currentWorkspaceName }}</span>
        </div>
      </div>

      <div class="messages" ref="messagesContainer">
        <ErrorAlert
          v-if="chatStore.error"
          :code="chatStore.error.code"
          :message="chatStore.error.message"
          dismissible
          @dismiss="chatStore.error = null"
        />

        <div v-if="chatStore.hasMoreMessages" class="load-more">
          <button class="load-more-btn" @click="loadMore" :disabled="loadingMore">
            {{ loadingMore ? '加载中...' : '加载更早的消息' }}
          </button>
        </div>

        <template v-for="item in mergedFeed" :key="item.id">
          <MessageItem
            v-if="item.type === 'message'"
            :message="item.message"
          />
          <TaskMessageBlock
            v-else
            :process-items="item.processItems"
            :summary-message="item.summaryMessage"
            :running="item.running"
          />
        </template>

        <div v-if="mergedFeed.length === 0" class="empty-state">
          <div class="empty-mark display-serif">TieX</div>
          <div class="empty-text">等待第一条任务</div>
          <div class="empty-subtext">从下面输入一个目标开始对话。</div>
        </div>
      </div>

      <ChatComposer />
    </div>
  </div>
</template>

<style scoped>
.chat-layout {
  width: 100%;
  height: 100%;
  display: block;
}

.chat-main {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.session-strip {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px max(28px, calc((100% - 860px) / 2)) 0;
  flex-wrap: wrap;
}

.session-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--panel) 92%, transparent);
  border: 1px solid var(--line);
  color: var(--text-strong);
}

.activity-pill {
  color: var(--muted);
}

.activity-pill.running {
  color: var(--accent);
}

.activity-pill.idle {
  border-color: color-mix(in srgb, var(--success) 24%, var(--line));
  color: var(--success-strong);
}

.workspace-tag {
  margin-left: auto;
}

.messages {
  flex: 1;
  overflow: auto;
  padding: 24px max(28px, calc((100% - 860px) / 2)) 16px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: var(--muted);
}

.empty-mark {
  font-size: 56px;
  color: color-mix(in srgb, var(--accent) 70%, var(--text));
  line-height: 1;
}

.empty-text {
  font-size: 15px;
}

.empty-subtext {
  max-width: 380px;
  text-align: center;
  color: var(--muted-soft);
  font-size: 13px;
  line-height: 1.6;
}

.load-more {
  display: flex;
  justify-content: center;
  padding: 12px 0;
}

.load-more-btn {
  background: color-mix(in srgb, var(--panel) 88%, transparent);
  border: 1px solid var(--line);
  color: var(--text-strong);
  padding: 8px 18px;
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.load-more-btn:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--accent);
  transform: translateY(-1px);
}

.load-more-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 900px) {
  .session-strip {
    padding-top: 12px;
  }

  .workspace-tag {
    margin-left: 0;
  }
}
</style>

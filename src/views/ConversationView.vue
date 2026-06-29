<script setup lang="ts">
import { ref, watch, onMounted, nextTick, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { FolderOpen } from 'lucide-vue-next'
import { useChatStore } from '@/stores/chat.store'
import { useConversationStore } from '@/stores/conversation.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { useTaskStore } from '@/stores/task.store'
import { useUiStore } from '@/stores/ui.store'
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
const uiStore = useUiStore()
const route = useRoute()
const router = useRouter()
const messagesContainer = ref<HTMLElement | null>(null)
const loadingMore = ref(false)
const pendingProcessingScrollRequest = ref<number | null>(null)

const currentConversation = computed(() =>
  conversationStore.conversations.find((item) => item.id === conversationStore.currentConversationId) ?? null
)
const sessionWorkspaceId = computed(() => currentConversation.value?.workspace_id ?? null)
const sessionWorkspaceName = computed(() => {
  const workspaceId = sessionWorkspaceId.value
  if (!workspaceId) return ''
  if (workspaceStore.currentWorkspace?.id === workspaceId) {
    return workspaceStore.currentWorkspace.name
  }
  return workspaceStore.workspaces.find((item) => item.id === workspaceId)?.name ?? ''
})

type FeedItem =
  | { id: string; type: 'message'; createdAt: string; message: typeof chatStore.messages[number] }
  | {
      id: string
      type: 'task-block'
      taskId: string
      createdAt: string
      processItems: ProcessStreamItem[]
      summaryMessage: ChatMessage | null
      running: boolean
      agentBadges?: Array<{
        id: string
        label: string
        status: 'running' | 'completed' | 'failed'
      }>
    }

type TaskBlockFeedItem = Extract<FeedItem, { type: 'task-block' }>

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

function isFinalMainResponderStep(step: { step_type: string; status: string; content?: string | null }): boolean {
  const content = step.content?.trim() || ''
  return step.step_type === 'agent_brief' &&
    step.status === 'completed' &&
    (content.includes('[主对话 Agent]') || content.includes('主对话 Agent'))
}

function agentTitleFromStep(content: string, stepType: string): string {
  if (stepType === 'agent_route') return '主对话 Agent'
  if (content.includes('[资料整理 Agent]') || content.includes('资料整理 Agent')) return '资料整理 Agent'
  if (content.includes('[规则记忆 Agent]') || content.includes('规则记忆 Agent')) return '规则记忆 Agent'
  if (content.includes('[主对话 Agent]') || content.includes('主对话 Agent')) return '主对话 Agent'
  return '协作 Agent'
}

function stepStatus(status: string): 'running' | 'completed' | 'failed' {
  return status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : 'running'
}

function formatAgentStepDetail(content: string, stepType: string): string {
  if (stepType !== 'agent_route') return content
  const cleaned = content
    .replace(/^\[主对话 Agent\]\s*/m, '')
    .replace(/调用决策：/g, '**调用决策**：')
    .replace(/原因：/g, '**原因**：')
    .trim()
  return cleaned || content
}

const agentEntries = computed<ActivityEntry[]>(() => {
  const agentSteps = taskStore.steps
    .filter((step) => step.step_type === 'agent_route' || step.step_type === 'agent_brief')
    .filter((step) => !isFinalMainResponderStep(step))
    .map((step) => {
      const content = step.content?.trim() || ''

      return {
        id: `agent-${step.id}`,
        kind: 'agent' as const,
        createdAt: step.created_at,
        title: agentTitleFromStep(content, step.step_type),
        status: stepStatus(step.status),
        detail: content ? formatAgentStepDetail(content, step.step_type) : undefined,
      }
    })

  const currentTask = taskStore.currentTask
  if (!currentTask) {
    return agentSteps
  }

  const hasImplementationWork =
    taskStore.toolCalls.length > 0 ||
    taskStore.steps.some((step) => step.step_type === 'implementation_result' || step.step_type === 'model_request')

  if (!hasImplementationWork) {
    return agentSteps
  }

  const implementationStatus =
    currentTask.status === 'completed'
      ? 'completed'
      : currentTask.status === 'failed' || currentTask.status === 'stopped'
        ? 'failed'
        : 'running'

  return [
    ...agentSteps,
    {
      id: `agent-implementation-${currentTask.id}`,
      kind: 'agent' as const,
      createdAt: currentTask.createdAt,
      title: '代码实现 Agent',
      status: implementationStatus as 'running' | 'completed' | 'failed',
      detail:
        implementationStatus === 'running'
          ? '负责实际调用工具、读取工作区并产出执行结论，供主对话 Agent 整理。'
          : currentTask.errorMessage || '负责实际调用工具、读取工作区并产出执行结论，供主对话 Agent 整理。',
    },
  ]
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

  for (const agent of agentEntries.value) {
    list.push(agent)
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

  for (const session of Array.from(taskStore.commandSessions.values()).filter((item) => item.taskId === currentTask?.id)) {
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

const agentBadges = computed(() => {
  return agentEntries.value.map((entry) => ({
    id: entry.id,
    label: entry.title.replace(' Agent', ''),
    status: entry.status as 'running' | 'completed' | 'failed',
  }))
})

const assistantMessagesByTaskId = computed(() => {
  const groups = new Map<string, ChatMessage[]>()
  for (const message of chatStore.messages) {
    if (message.role !== 'assistant' || !message.taskId) continue
    const bucket = groups.get(message.taskId) ?? []
    bucket.push(message)
    groups.set(message.taskId, bucket)
  }
  return groups
})

const messagesById = computed(() => {
  const map = new Map<string, ChatMessage>()
  for (const message of chatStore.messages) {
    map.set(message.id, message)
  }
  return map
})

const visibleTaskIds = computed(() => {
  const ids = new Set<string>(taskStore.conversationTasks.map((task) => task.id))
  for (const taskId of assistantMessagesByTaskId.value.keys()) {
    ids.add(taskId)
  }
  if (taskStore.currentTask?.id) {
    ids.add(taskStore.currentTask.id)
  }
  return Array.from(ids).sort((leftId, rightId) => {
    const leftMessages = assistantMessagesByTaskId.value.get(leftId) ?? []
    const rightMessages = assistantMessagesByTaskId.value.get(rightId) ?? []
    const leftTask = taskStore.conversationTasks.find((task) => task.id === leftId)
    const rightTask = taskStore.conversationTasks.find((task) => task.id === rightId)
    const leftCreatedAt = leftMessages[0]?.createdAt ?? leftTask?.createdAt ?? ''
    const rightCreatedAt = rightMessages[0]?.createdAt ?? rightTask?.createdAt ?? ''
    return new Date(leftCreatedAt).getTime() - new Date(rightCreatedAt).getTime()
  })
})

const taskProcessItems = computed<ProcessStreamItem[]>(() => {
  const currentTaskId = taskStore.currentTask?.id ?? ''
  const task = taskStore.currentTask
  const assistantMessages = (assistantMessagesByTaskId.value.get(currentTaskId) ?? []).filter((message) => message.content.trim())
  const anchoredSummaryMessage =
    task?.assistantMessageId ? messagesById.value.get(task.assistantMessageId) ?? null : null
  const summaryMessage = anchoredSummaryMessage?.content?.trim()
    ? anchoredSummaryMessage
    : assistantMessages[assistantMessages.length - 1] ?? null
  const noteItems = buildTaskNoteItems(currentTaskId, summaryMessage)
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

function buildTaskNoteItems(taskId: string, summaryMessage: ChatMessage | null): ProcessStreamItem[] {
  const summaryMessageId = summaryMessage?.id ?? null
  return (assistantMessagesByTaskId.value.get(taskId) ?? [])
    .filter((message) => message.id !== summaryMessageId)
    .filter((message) => message.content.trim())
    .map((message) => ({
      id: `note-${taskId}-${message.id}`,
      kind: 'note' as const,
      createdAt: message.createdAt,
      content: message.content,
      streaming: message.isStreaming === 1,
    }))
}

function buildAgentEntriesForTask(taskId: string): ActivityEntry[] {
  const task = taskStore.conversationTasks.find((item) => item.id === taskId) ?? null
  const taskSteps = taskStore.stepsByTaskId[taskId] ?? []
  const agentSteps = taskSteps
    .filter((step) => step.step_type === 'agent_route' || step.step_type === 'agent_brief')
    .filter((step) => !isFinalMainResponderStep(step))
    .map((step) => {
      const content = step.content?.trim() || ''

      return {
        id: `agent-${taskId}-${step.id}`,
        kind: 'agent' as const,
        createdAt: step.created_at,
        title: agentTitleFromStep(content, step.step_type),
        status: stepStatus(step.status),
        detail: content ? formatAgentStepDetail(content, step.step_type) : undefined,
      }
    })

  const hasImplementationWork =
    (taskStore.toolCallsByTaskId[taskId]?.length ?? 0) > 0 ||
    taskSteps.some((step) => step.step_type === 'implementation_result' || step.step_type === 'model_request')

  if (!task || !hasImplementationWork) {
    return agentSteps
  }

  const implementationStatus =
    task.status === 'completed'
      ? 'completed'
      : task.status === 'failed' || task.status === 'stopped'
        ? 'failed'
        : 'running'

  return [
    ...agentSteps,
    {
      id: `agent-implementation-${taskId}`,
      kind: 'agent' as const,
      createdAt: task.createdAt,
      title: '代码实现 Agent',
      status: implementationStatus as 'running' | 'completed' | 'failed',
      detail:
        implementationStatus === 'running'
          ? '负责实际调用工具、读取工作区并产出执行结论，供主对话 Agent 整理。'
          : task.errorMessage || '负责实际调用工具、读取工作区并产出执行结论，供主对话 Agent 整理。',
    },
  ]
}

function buildTaskStatusEntry(taskId: string): ActivityEntry | null {
  const task = taskStore.conversationTasks.find((item) => item.id === taskId)
  if (!task) return null
  const status =
    task.status === 'completed'
      ? 'completed'
      : task.status === 'failed'
        ? 'failed'
        : task.status === 'stopped'
          ? 'stopped'
          : 'running'

  return {
    id: `task-${task.id}`,
    kind: 'task',
    createdAt: task.createdAt,
    title: task.title || 'Agent 任务',
    status,
    detail: task.errorMessage || undefined,
  }
}

function buildHistoricalActivityEntries(taskId: string): ActivityEntry[] {
  const list: ActivityEntry[] = []
  const taskEntry = buildTaskStatusEntry(taskId)
  if (taskEntry) {
    list.push(taskEntry)
  }

  const permissionRequests = taskStore.permissionRequestsByTaskId[taskId] ?? []
  for (const request of permissionRequests) {
    list.push({
      id: `perm-${taskId}-${request.id}`,
      kind: 'permission',
      createdAt: request.requested_at,
      title: request.title,
      status: request.status === 'pending' ? 'waiting' : request.status === 'approved' ? 'approved' : 'rejected',
      detail: request.reason || request.target || undefined,
      requestId: request.id,
    })
  }

  for (const agent of buildAgentEntriesForTask(taskId)) {
    list.push(agent)
  }

  const toolCalls = taskStore.toolCallsByTaskId[taskId] ?? []
  for (const toolCall of toolCalls) {
    list.push({
      id: `tool-${taskId}-${toolCall.id}`,
      kind: 'tool',
      createdAt: toolCall.created_at,
      title: toolCall.tool_name,
      status: toolCall.status === 'completed' ? 'completed' : toolCall.status === 'failed' ? 'failed' : 'running',
      detail: toolCall.error_message || undefined,
    })
  }

  const artifacts = taskStore.artifactsByTaskId[taskId] ?? []
  for (const artifact of artifacts) {
    list.push({
      id: `artifact-${taskId}-${artifact.id}`,
      kind: 'artifact',
      createdAt: artifact.created_at,
      title: artifact.name,
      status: 'completed',
      artifactId: artifact.id,
    })
  }

  const commandSessions = taskStore.commandSessionsByTaskId[taskId] ?? []
  for (const session of commandSessions) {
    list.push({
      id: `cmd-${taskId}-${session.sessionId}`,
      kind: 'command',
      createdAt: session.startedAt,
      title: session.command || '命令执行',
      status: session.status,
      sessionId: session.sessionId,
    })
  }

  return list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
}

const taskBlocks = computed<TaskBlockFeedItem[]>(() => {
  return visibleTaskIds.value.map((taskId) => {
    const assistantMessages = (assistantMessagesByTaskId.value.get(taskId) ?? []).filter((message) => message.content.trim())
    const task = taskStore.conversationTasks.find((item) => item.id === taskId) ?? null
    const anchoredSummaryMessage =
      task?.assistantMessageId ? messagesById.value.get(task.assistantMessageId) ?? null : null
    const summaryMessage = anchoredSummaryMessage?.content?.trim()
      ? anchoredSummaryMessage
      : assistantMessages[assistantMessages.length - 1] ?? null
    const isCurrentTask = taskStore.currentTask?.id === taskId
    const processItems = isCurrentTask
      ? taskProcessItems.value
      : [
          ...buildTaskNoteItems(taskId, summaryMessage),
          ...buildHistoricalActivityEntries(taskId).map((entry) => ({
            id: `activity-${entry.id}`,
            kind: 'activity' as const,
            createdAt: entry.createdAt,
            entry,
          })),
        ].sort((a, b) => {
          const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          if (timeDiff !== 0) return timeDiff
          if (a.kind === b.kind) return 0
          return a.kind === 'note' ? -1 : 1
        })

    const userAnchorMessage =
      task?.userMessageId ? messagesById.value.get(task.userMessageId) ?? null : null
    const createdAt = userAnchorMessage?.createdAt ?? summaryMessage?.createdAt ?? task?.createdAt ?? new Date().toISOString()

    return {
      id: `activity-group-${taskId}`,
      type: 'task-block' as const,
      taskId,
      createdAt,
      processItems,
      summaryMessage,
      running: isCurrentTask && (taskStore.isRunning || chatStore.isStreaming),
      agentBadges: isCurrentTask ? agentBadges.value : undefined,
    }
  }).filter((item) => item.processItems.length > 0 || !!item.summaryMessage)
})

const mergedFeed = computed<FeedItem[]>(() => {
  const taskIdsInBlocks = new Set(taskBlocks.value.map((item) => item.taskId))
  const summaryMessageIds = new Set(
    taskBlocks.value
      .map((item) => item.summaryMessage?.id ?? null)
      .filter((id): id is string => !!id)
  )
  const messageItems: FeedItem[] = chatStore.messages
    .filter((message) => {
      if (message.role !== 'assistant') return true
      if (summaryMessageIds.has(message.id)) return false
      return !(message.taskId && taskIdsInBlocks.has(message.taskId))
    })
    .map((message) => ({
    id: `msg-${message.id}`,
    type: 'message',
    createdAt: message.createdAt,
    message,
  }))
  const items = [...messageItems, ...taskBlocks.value]
  return items.sort((left, right) => {
    const timeDiff = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
    if (timeDiff !== 0) return timeDiff
    if (left.type === right.type) return 0
    return left.type === 'message' ? -1 : 1
  })
})

const processingScrollAnchorReady = computed(() => {
  if (taskProcessItems.value.length > 0) return true
  if ((assistantMessagesByTaskId.value.get(taskStore.currentTask?.id ?? '') ?? []).length > 0) return true
  if (!taskStore.currentTask) return chatStore.messages.length > 0
  return false
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
      const conversation = conversationStore.conversations.find((item) => item.id === newId) ?? null
      if (conversation?.workspace_id && workspaceStore.currentWorkspaceId !== conversation.workspace_id) {
        await workspaceStore.switchWorkspace(conversation.workspace_id)
      }
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
  () => chatStore.scrollToBottomRequest,
  (value) => {
    pendingProcessingScrollRequest.value = value
    if (processingScrollAnchorReady.value) {
      void scrollToBottom().then(() => {
        pendingProcessingScrollRequest.value = null
      })
    }
  }
)

watch(
  () => processingScrollAnchorReady.value,
  async (ready) => {
    if (!ready || pendingProcessingScrollRequest.value === null) return
    await scrollToBottom()
    pendingProcessingScrollRequest.value = null
  }
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

async function branchFromMessage(message: ChatMessage) {
  const conversationId = conversationStore.currentConversationId
  if (!conversationId) return
  try {
    const branch = await window.tiex.conversation.branchFromMessage(conversationId, message.id)
    await conversationStore.loadConversations()
    conversationStore.setCurrentConversation(branch.id)
    await router.push(`/conversation/${branch.id}`)
  } catch (err) {
    console.error('Failed to branch conversation:', err)
  }
}

async function inspectTask(taskId: string) {
  await taskStore.setCurrentTask(taskId)
  uiStore.setDrawerTab('steps')
  uiStore.openDrawer()
}

async function inspectTaskContext(taskId: string) {
  await taskStore.setCurrentTask(taskId)
  uiStore.setDrawerTab('context')
  uiStore.openDrawer()
}

async function inspectTaskTab(taskId: string, tab: 'steps' | 'files' | 'changes' | 'permissions' | 'artifacts') {
  await taskStore.setCurrentTask(taskId)
  uiStore.setDrawerTab(tab)
  uiStore.openDrawer()
}

function asTaskBlock(item: FeedItem): TaskBlockFeedItem {
  return item as TaskBlockFeedItem
}
</script>

<template>
  <div class="chat-layout">
    <div class="chat-main">
      <div class="session-strip" v-if="sessionWorkspaceId">
        <div class="session-pill activity-pill" :class="activityMeta.tone">
          <span class="status-dot" v-if="activityMeta.tone === 'running'" />
          <span>{{ activityMeta.label }}</span>
        </div>
        <div class="session-pill workspace-tag">
          <FolderOpen :size="12" />
          <span>{{ sessionWorkspaceName }}</span>
        </div>
        <div
          v-for="badge in agentBadges"
          :key="badge.id"
          class="session-pill agent-pill"
          :class="badge.status"
        >
          <span>{{ badge.label }}</span>
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
            @branch="branchFromMessage"
          />
          <TaskMessageBlock
            v-else
            :task-id="asTaskBlock(item).taskId"
            :process-items="asTaskBlock(item).processItems"
            :summary-message="asTaskBlock(item).summaryMessage"
            :running="asTaskBlock(item).running"
            :agent-badges="asTaskBlock(item).agentBadges"
            @inspect="inspectTask"
            @inspect-context="inspectTaskContext"
            @inspect-tab="inspectTaskTab"
          />
        </template>

        <div v-if="mergedFeed.length === 0" class="empty-state">
          <div class="empty-mark">TieX</div>
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
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--topbar-bg) 48%, transparent), transparent 180px),
    var(--bg);
}

.chat-main {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.session-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px max(28px, calc((100% - 840px) / 2)) 0;
  flex-wrap: wrap;
}

.session-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--sidebar-surface) 92%, transparent);
  border: 1px solid var(--sidebar-border);
  color: var(--sidebar-text-soft);
  font-size: 12px;
}

.activity-pill.running {
  color: var(--accent);
}

.activity-pill.idle {
  border-color: color-mix(in srgb, var(--success) 16%, var(--sidebar-border));
  color: var(--success-strong);
}

.workspace-tag {
  margin-left: auto;
}

.agent-pill.running {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 14%, var(--sidebar-border));
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.agent-pill.completed {
  color: var(--success-strong);
  border-color: color-mix(in srgb, var(--success) 14%, var(--sidebar-border));
  background: color-mix(in srgb, var(--success) 8%, transparent);
}

.agent-pill.failed {
  color: var(--danger-strong);
  border-color: color-mix(in srgb, var(--danger) 14%, var(--sidebar-border));
  background: color-mix(in srgb, var(--danger) 8%, transparent);
}

.messages {
  flex: 1;
  overflow: auto;
  padding: 24px max(28px, calc((100% - 840px) / 2)) 16px;
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
  font-size: 13px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--muted-soft);
  line-height: 1;
}

.empty-text {
  font-size: 30px;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--text-strong);
}

.empty-subtext {
  max-width: 420px;
  text-align: center;
  color: var(--muted-soft);
  font-size: 14px;
  line-height: 1.6;
}

.load-more {
  display: flex;
  justify-content: center;
  padding: 12px 0;
}

.load-more-btn {
  background: color-mix(in srgb, var(--sidebar-surface) 92%, transparent);
  border: 1px solid var(--sidebar-border);
  color: var(--sidebar-text);
  padding: 8px 18px;
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
}

.load-more-btn:hover:not(:disabled) {
  color: var(--text-strong);
  border-color: color-mix(in srgb, var(--sidebar-text-soft) 16%, var(--sidebar-border));
  background: var(--sidebar-item-hover);
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

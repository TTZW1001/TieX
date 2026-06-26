<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { FolderOpen, Send, Square } from 'lucide-vue-next'
import { useChatStore } from '@/stores/chat.store'
import { useConversationStore } from '@/stores/conversation.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { useTaskStore } from '@/stores/task.store'
import { useUiStore } from '@/stores/ui.store'

const chatStore = useChatStore()
const conversationStore = useConversationStore()
const workspaceStore = useWorkspaceStore()
const taskStore = useTaskStore()
const uiStore = useUiStore()
const inputText = ref('')

const showStopButton = computed(() => taskStore.isRunning || chatStore.isStreaming)

type ComposerStatusTone = 'running' | 'ready' | 'warning' | 'danger' | 'idle'

const statusTone = computed<ComposerStatusTone>(() => {
  const taskStatus = taskStore.currentTask?.status

  if (taskStore.isRunning || chatStore.isStreaming) return 'running'
  if (taskStatus === 'failed') return 'danger'
  if (taskStatus === 'stopped' || taskStatus === 'waiting_permission') return 'warning'
  if (workspaceStore.hasWorkspace) return 'ready'
  return 'idle'
})

const statusText = computed(() => {
  if (taskStore.isRunning) return 'Agent 正在执行任务'
  if (chatStore.isStreaming) return '模型正在输出内容'
  if (taskStore.currentTask?.status === 'failed') return '上一轮任务执行失败'
  if (taskStore.currentTask?.status === 'stopped') return '上一轮任务已停止'
  if (taskStore.currentTask?.status === 'waiting_permission') return '等待你确认后继续'
  if (workspaceStore.hasWorkspace) return `当前工作区：${workspaceStore.currentWorkspaceName}`
  return '未绑定工作区'
})

const canSend = computed(() => !!inputText.value.trim() && !showStopButton.value)

watch(
  () => uiStore.composerDraft,
  (value) => {
    if (!value) return
    inputText.value = value
    uiStore.clearComposerDraft()
  }
)

async function send() {
  if (!inputText.value.trim() || showStopButton.value) return

  const conversationId = conversationStore.currentConversationId
  if (!conversationId) return

  const content = inputText.value.trim()
  inputText.value = ''

  try {
    if (workspaceStore.currentWorkspaceId) {
      const taskId = await chatStore.sendAgentMessage(conversationId, content, {
        workspaceId: workspaceStore.currentWorkspaceId,
      })
      if (taskId) {
        taskStore.setCurrentTask(taskId)
      }
    } else {
      await chatStore.sendMessage(conversationId, content)
    }

    conversationStore.loadConversations()
  } catch (err) {
    console.error('Send message failed:', err)
  }
}

function stop() {
  const conversationId = conversationStore.currentConversationId
  if (!conversationId) return
  const taskId = taskStore.currentTask?.id
  chatStore.stopGeneration(conversationId, taskId ?? undefined)
}

async function selectWorkspace() {
  await workspaceStore.selectWorkspace()
}
</script>

<template>
  <div class="chat-composer-wrap">
    <div class="chat-composer">
      <div class="composer-status" aria-live="polite">
        <span class="status-dot composer-status-dot" :class="`is-${statusTone}`" />
        <span>{{ statusText }}</span>
      </div>

      <textarea
        v-model="inputText"
        @keydown.enter.exact.prevent="send"
        :disabled="showStopButton"
        :placeholder="workspaceStore.hasWorkspace ? '描述你想让 TieX 在当前工作区完成的任务' : '输入你想讨论的问题，或先选择一个工作区'"
        aria-label="消息输入框"
      ></textarea>

      <div class="composer-footer">
        <button class="chip workspace-chip" @click="selectWorkspace">
          <FolderOpen :size="14" />
          {{ workspaceStore.hasWorkspace ? workspaceStore.currentWorkspaceName : '选择工作区' }}
        </button>

        <button v-if="showStopButton" class="send-btn stop-btn" @click="stop">
          <Square :size="14" /> 停止
        </button>
        <button v-else class="send-btn" @click="send" :disabled="!canSend">
          <Send :size="14" /> 发送
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-composer-wrap {
  padding: 18px max(28px, calc((100% - 860px) / 2)) 28px;
}

.chat-composer {
  background: color-mix(in srgb, var(--panel) 92%, transparent);
  border: 1px solid var(--line);
  border-radius: 28px;
  padding: 18px;
  box-shadow: var(--shadow-soft);
  backdrop-filter: blur(18px);
}

.chat-composer:focus-within {
  border-color: color-mix(in srgb, var(--accent) 44%, var(--line));
  box-shadow: var(--shadow-pop);
}

.composer-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 20px;
  margin-bottom: 10px;
  color: var(--muted);
  font-size: 12px;
}

.composer-status-dot {
  color: var(--muted-soft);
  animation: none;
}

.composer-status-dot.is-running {
  color: var(--accent);
  animation: statusPulse 1.8s var(--ease-in-out) infinite;
}

.composer-status-dot.is-ready {
  color: var(--success-strong);
}

.composer-status-dot.is-warning {
  color: var(--warning-strong);
}

.composer-status-dot.is-danger {
  color: var(--danger-strong);
}

.composer-status-dot.is-idle {
  color: var(--muted-soft);
}

.chat-composer textarea {
  width: 100%;
  min-height: 92px;
  resize: none;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font-size: 16px;
  line-height: 1.7;
}

.chat-composer textarea:disabled {
  opacity: 0.65;
}

.composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.workspace-chip {
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stop-btn {
  background: var(--danger);
  border-color: var(--danger);
}

@media (max-width: 900px) {
  .composer-footer {
    justify-content: flex-start;
  }
}
</style>

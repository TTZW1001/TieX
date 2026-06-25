<script setup lang="ts">
import { ref, computed } from 'vue'
import { FolderOpen, Shield, Cpu, Send, Square } from 'lucide-vue-next'
import { useChatStore } from '@/stores/chat.store'
import { useConversationStore } from '@/stores/conversation.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { useTaskStore } from '@/stores/task.store'

const chatStore = useChatStore()
const conversationStore = useConversationStore()
const workspaceStore = useWorkspaceStore()
const taskStore = useTaskStore()
const inputText = ref('')

const permissionMode = computed<'chat' | 'read' | 'execute' | 'command'>(() => {
  return workspaceStore.hasWorkspace ? 'command' : 'chat'
})

const modeLabel = computed(() => {
  switch (permissionMode.value) {
    case 'command': return '命令'
    case 'execute': return '执行'
    case 'read': return '读取'
    default: return '对话'
  }
})

const showStopButton = computed(() => {
  return taskStore.isRunning || chatStore.isStreaming
})

const canSend = computed(() => {
  return !!inputText.value.trim() && !showStopButton.value
})

async function send() {
  if (!inputText.value.trim()) return
  if (showStopButton.value) return

  const conversationId = conversationStore.currentConversationId
  if (!conversationId) return

  const content = inputText.value.trim()
  inputText.value = ''

  try {
    if (
      (permissionMode.value === 'read' ||
        permissionMode.value === 'execute' ||
        permissionMode.value === 'command') &&
      workspaceStore.currentWorkspaceId
    ) {
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
</script>

<template>
  <div class="chat-composer-wrap">
    <div class="chat-composer">
      <div class="composer-head">
        <div class="composer-meta">
          <span class="meta-label">模式</span>
          <strong>{{ modeLabel }}</strong>
        </div>
        <div class="composer-meta" v-if="workspaceStore.hasWorkspace">
          <span class="meta-label">工作区</span>
          <strong>{{ workspaceStore.currentWorkspaceName }}</strong>
        </div>
      </div>

      <textarea
        v-model="inputText"
        @keydown.enter.exact.prevent="send"
        :disabled="showStopButton"
      ></textarea>

      <div class="composer-footer">
        <button class="chip" :class="{ 'chip-active': permissionMode !== 'chat' }">
          <Shield :size="14" /> {{ modeLabel }}
        </button>
        <button class="chip">
          <Cpu :size="14" /> DeepSeek
        </button>
        <button v-if="workspaceStore.hasWorkspace" class="chip workspace-chip">
          <FolderOpen :size="14" /> {{ workspaceStore.currentWorkspaceName }}
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
  padding: 18px 18px 16px;
  box-shadow: var(--shadow-soft);
  backdrop-filter: blur(18px);
}

.composer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.composer-meta {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.meta-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--muted-soft);
}

.composer-meta strong {
  font-size: 14px;
  color: var(--text-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-composer textarea {
  width: 100%;
  min-height: 88px;
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
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.workspace-chip {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stop-btn {
  background: var(--danger);
  border-color: var(--danger);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 900px) {
  .composer-head {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { FolderOpen, Paperclip, Send, Square, X } from 'lucide-vue-next'
import { useChatStore } from '@/stores/chat.store'
import { useConversationStore } from '@/stores/conversation.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { useTaskStore } from '@/stores/task.store'
import { useUiStore } from '@/stores/ui.store'
import { useSettingsStore } from '@/stores/settings.store'
import { supportsMultimodal } from '@/utils/provider-capabilities'

const chatStore = useChatStore()
const conversationStore = useConversationStore()
const workspaceStore = useWorkspaceStore()
const taskStore = useTaskStore()
const uiStore = useUiStore()
const settingsStore = useSettingsStore()
const inputText = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const attachments = ref<Array<{ path: string; name: string; mimeType: string | null; size: number | null }>>([])

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

const canSend = computed(() => (!!inputText.value.trim() || attachments.value.length > 0) && !showStopButton.value)
const currentProvider = computed(() => {
  const conversation = conversationStore.conversations.find((item) => item.id === conversationStore.currentConversationId)
  const provider = settingsStore.providers.find((item) => item.id === (conversation?.provider_id ?? settingsStore.providerId))
  return provider ?? null
})
const canAttach = computed(() => {
  const provider = currentProvider.value
  if (!provider) return false
  return supportsMultimodal(provider.provider_type, provider.model_name)
})

const attachmentLabel = computed(() => {
  if (attachments.value.length === 0) return '添加附件'
  return `已附加 ${attachments.value.length} 个文件`
})

watch(
  () => uiStore.composerDraft,
  (value) => {
    if (!value) return
    inputText.value = value
    uiStore.clearComposerDraft()
  }
)

async function send() {
  if ((!inputText.value.trim() && attachments.value.length === 0) || showStopButton.value) return

  const conversationId = conversationStore.currentConversationId
  if (!conversationId) return

  const content = inputText.value.trim() || '请结合我附加的内容继续。'
  const currentAttachments = attachments.value.map((attachment) => ({ ...attachment }))
  inputText.value = ''
  attachments.value = []
  if (fileInput.value) fileInput.value.value = ''

  try {
    if (workspaceStore.currentWorkspaceId) {
      const taskId = await chatStore.sendAgentMessage(conversationId, content, {
        workspaceId: workspaceStore.currentWorkspaceId,
        attachments: currentAttachments,
      })
      if (taskId) {
        taskStore.setCurrentTask(taskId)
      }
    } else {
      await chatStore.sendMessage(conversationId, content, currentAttachments)
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

function triggerAttachmentPicker() {
  if (!canAttach.value) return
  fileInput.value?.click()
}

function removeAttachment(index: number) {
  attachments.value.splice(index, 1)
}

function handleFileChange(event: Event) {
  if (!canAttach.value) return
  const target = event.target as HTMLInputElement | null
  const files = target?.files ? Array.from(target.files) : []
  attachments.value = files
    .map((file) => {
      const maybeFile = file as File & { path?: string }
      return {
        path: maybeFile.path || '',
        name: file.name,
        mimeType: file.type || null,
        size: Number.isFinite(file.size) ? file.size : null,
      }
    })
    .filter((file) => !!file.path)
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
        <div class="composer-left">
          <button class="chip workspace-chip" @click="selectWorkspace">
            <FolderOpen :size="14" />
            {{ workspaceStore.hasWorkspace ? workspaceStore.currentWorkspaceName : '选择工作区' }}
          </button>
          <button class="chip attachment-chip" :class="{ disabled: !canAttach }" @click="triggerAttachmentPicker">
            <Paperclip :size="14" />
            {{ canAttach ? attachmentLabel : '当前模型不支持附件' }}
          </button>
          <div v-if="!canAttach" class="attachment-hint">切换到支持多模态的模型后可上传附件。</div>
          <input ref="fileInput" type="file" multiple class="hidden-file-input" @change="handleFileChange" />
        </div>

        <button v-if="showStopButton" class="send-btn stop-btn" @click="stop">
          <Square :size="14" /> 停止
        </button>
        <button v-else class="send-btn" @click="send" :disabled="!canSend">
          <Send :size="14" /> 发送
        </button>
      </div>

      <div v-if="attachments.length > 0" class="attachment-list">
        <div v-for="(attachment, index) in attachments" :key="`${attachment.path}-${index}`" class="attachment-pill">
          <span class="attachment-name">{{ attachment.name }}</span>
          <button class="attachment-remove" @click="removeAttachment(index)">
            <X :size="12" />
          </button>
        </div>
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

.composer-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.attachment-hint {
  font-size: 11px;
  color: var(--muted);
}

.workspace-chip {
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hidden-file-input {
  display: none;
}

.attachment-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.attachment-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--panel) 90%, transparent);
  color: var(--muted);
  max-width: 100%;
}

.attachment-name {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-remove {
  border: 0;
  background: transparent;
  color: var(--muted-soft);
  cursor: pointer;
  display: grid;
  place-items: center;
}

.attachment-chip.disabled {
  opacity: 0.55;
  cursor: not-allowed;
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

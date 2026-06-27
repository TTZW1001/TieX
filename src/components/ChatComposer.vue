<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { FolderOpen, Paperclip, Send, SlidersHorizontal, Square, X } from 'lucide-vue-next'
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
const showSessionConfig = ref(false)
const sessionConfigWrap = ref<HTMLElement | null>(null)

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
const currentConversation = computed(() =>
  conversationStore.conversations.find((item) => item.id === conversationStore.currentConversationId) ?? null
)
const currentProvider = computed(() => {
  const provider = settingsStore.providers.find((item) => item.id === (currentConversation.value?.provider_id ?? settingsStore.providerId))
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
const currentPermissionMode = computed(() => {
  if (!workspaceStore.hasWorkspace) return 'chat'
  const mode = currentConversation.value?.permission_mode
  if (mode === 'read' || mode === 'execute' || mode === 'command') return mode
  return settingsStore.defaultPermissionMode
})
const permissionModeHint = computed(() => {
  if (!workspaceStore.hasWorkspace) return '未绑定工作区时仅聊天，不会调用本地工具。'
  if (currentPermissionMode.value === 'read') return '只读查看工作区，不改文件，也不执行命令。'
  if (currentPermissionMode.value === 'execute') return '允许读写文件；是否弹确认由“修改文件前请求确认”决定。'
  if (currentPermissionMode.value === 'command') {
    return '允许读写文件并执行命令；是否弹确认由下面两个确认开关决定。'
  }
  return '当前是纯聊天模式。'
})
const providerModelLabel = computed(() => {
  const provider = currentProvider.value
  if (!provider) return '未选择模型服务'
  return `${provider.name} · ${provider.model_name}`
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

function toggleSessionConfig() {
  showSessionConfig.value = !showSessionConfig.value
}

function handleDocumentPointerDown(event: MouseEvent) {
  const target = event.target as Node | null
  if (!showSessionConfig.value || !target) return
  if (sessionConfigWrap.value?.contains(target)) return
  showSessionConfig.value = false
}

async function changeConversationProvider(event: Event) {
  const target = event.target as HTMLSelectElement | null
  const conversationId = conversationStore.currentConversationId
  if (!target || !conversationId) return
  await conversationStore.updateConversationProvider(conversationId, target.value || null)
  await conversationStore.loadConversations()
  showSessionConfig.value = true
}

async function changePermissionMode(event: Event) {
  const target = event.target as HTMLSelectElement | null
  const conversationId = conversationStore.currentConversationId
  if (!target || !conversationId) return
  const nextMode = target.value as 'chat' | 'read' | 'execute' | 'command'
  await conversationStore.updateConversationPermissionMode(conversationId, nextMode)
  await conversationStore.loadConversations()
  showSessionConfig.value = true
}

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentPointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleDocumentPointerDown)
})
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
          <div v-if="currentConversation" ref="sessionConfigWrap" class="session-config-wrap">
            <button class="chip session-config-trigger" @click="toggleSessionConfig">
              <SlidersHorizontal :size="14" />
              <span class="session-trigger-text">会话设置</span>
            </button>
            <div v-if="showSessionConfig" class="session-config-popover">
              <div class="session-config-head">
                <span>当前会话设置</span>
                <button class="popover-close" @click="showSessionConfig = false">
                  <X :size="12" />
                </button>
              </div>
              <label class="composer-select-field session-field">
                <span class="field-label">模型服务</span>
                <select class="composer-select" :value="currentConversation.provider_id ?? settingsStore.providerId ?? ''" @change="changeConversationProvider">
                  <option v-for="item in settingsStore.providers" :key="item.id" :value="item.id">
                    {{ item.name }}
                  </option>
                </select>
              </label>
              <div class="composer-model-pill session-model-pill" :title="providerModelLabel">
                {{ providerModelLabel }}
              </div>
              <label class="composer-select-field session-field">
                <span class="field-label">权限模式</span>
                <select class="composer-select" :value="currentPermissionMode" @change="changePermissionMode" :disabled="!workspaceStore.hasWorkspace">
                  <option value="chat">聊天</option>
                  <option value="read">只读</option>
                  <option value="execute">改文件</option>
                  <option value="command">命令执行</option>
                </select>
              </label>
              <div class="session-hint">{{ permissionModeHint }}</div>
            </div>
          </div>
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
  padding: 14px max(28px, calc((100% - 840px) / 2)) 24px;
}

.chat-composer {
  background: color-mix(in srgb, var(--sidebar-surface) 96%, transparent);
  border: 1px solid var(--sidebar-border);
  border-radius: 26px;
  padding: 16px;
  box-shadow: var(--shadow-soft);
}

.chat-composer:focus-within {
  border-color: color-mix(in srgb, var(--accent) 18%, var(--sidebar-border));
  box-shadow: 0 18px 34px rgba(34, 23, 15, 0.08);
}

.composer-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 20px;
  margin-bottom: 8px;
  color: var(--sidebar-text-muted);
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
  min-height: 88px;
  resize: none;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font-size: 15px;
  line-height: 1.75;
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
  margin-top: 10px;
}

.composer-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.session-config-wrap {
  position: relative;
}

.session-config-trigger {
  max-width: 280px;
}

.session-trigger-text {
  white-space: nowrap;
}

.composer-select-field {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 6px 0 2px;
}

.session-config-popover {
  position: absolute;
  left: 0;
  bottom: calc(100% + 10px);
  z-index: 20;
  width: min(320px, calc(100vw - 56px));
  padding: 14px;
  border-radius: 18px;
  border: 1px solid var(--sidebar-border);
  background: color-mix(in srgb, var(--sidebar-surface) 98%, transparent);
  box-shadow: 0 18px 34px rgba(34, 23, 15, 0.12);
}

.session-config-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  color: var(--text-strong);
  font-size: 13px;
  font-weight: 700;
}

.popover-close {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--muted);
  display: grid;
  place-items: center;
}

.popover-close:hover {
  background: var(--sidebar-item-hover);
  border-color: var(--sidebar-border);
  color: var(--text);
}

.session-field {
  width: 100%;
  justify-content: space-between;
  padding: 0;
  margin-top: 10px;
}

.field-label {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--sidebar-text-muted);
}

.composer-select {
  min-height: 36px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--sidebar-border);
  background: color-mix(in srgb, var(--sidebar-bg) 42%, transparent);
  color: var(--text);
}

.composer-select:disabled {
  opacity: 0.55;
}

.composer-model-pill {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--sidebar-border);
  background: color-mix(in srgb, var(--sidebar-bg) 42%, transparent);
  color: var(--sidebar-text);
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.session-model-pill {
  width: 100%;
  max-width: none;
  margin-top: 10px;
}

.session-hint {
  margin-top: 10px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--sidebar-text-muted);
}

.attachment-hint {
  font-size: 11px;
  color: var(--sidebar-text-muted);
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
  border: 1px solid var(--sidebar-border);
  background: color-mix(in srgb, var(--sidebar-bg) 52%, transparent);
  color: var(--sidebar-text-soft);
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
  color: var(--sidebar-text-muted);
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

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { FolderOpen, MessageSquareText, Paperclip, Send, SlidersHorizontal, Square, X } from 'lucide-vue-next'
import { useChatStore } from '@/stores/chat.store'
import { useConversationStore } from '@/stores/conversation.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { useTaskStore } from '@/stores/task.store'
import { useUiStore } from '@/stores/ui.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useAiSettingsStore } from '@/stores/ai-settings.store'
import { useSkillsStore } from '@/stores/skills.store'
import { getProviderCapabilities, getProviderCapabilityBadges, getProviderCapabilitySummary } from '@/utils/provider-capabilities'
import type { ComposerDraftSource } from '@/stores/ui.store'
import type { AiConfigInfo } from '@/types/global'

const chatStore = useChatStore()
const conversationStore = useConversationStore()
const workspaceStore = useWorkspaceStore()
const taskStore = useTaskStore()
const uiStore = useUiStore()
const settingsStore = useSettingsStore()
const aiSettingsStore = useAiSettingsStore()
const skillsStore = useSkillsStore()
const inputText = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const attachments = ref<Array<{ path: string; name: string; mimeType: string | null; size: number | null }>>([])
const showSessionConfig = ref(false)
const showSkillSuggest = ref(false)
const skillQuery = ref('')
const sessionConfigWrap = ref<HTMLElement | null>(null)
const draftNotice = ref('')
let draftNoticeTimer: ReturnType<typeof setTimeout> | null = null

const showStopButton = computed(() => taskStore.isRunning || chatStore.isStreaming)

type ComposerStatusTone = 'running' | 'ready' | 'warning' | 'danger' | 'idle'

const currentConversation = computed(() =>
  conversationStore.conversations.find((item) => item.id === conversationStore.currentConversationId) ?? null
)
const effectiveWorkspaceId = computed(() => currentConversation.value?.workspace_id ?? null)
const effectiveWorkspace = computed(() => {
  const workspaceId = effectiveWorkspaceId.value
  if (!workspaceId) return null
  if (workspaceStore.currentWorkspace?.id === workspaceId) {
    return workspaceStore.currentWorkspace
  }
  return workspaceStore.workspaces.find((item) => item.id === workspaceId) ?? null
})

const statusTone = computed<ComposerStatusTone>(() => {
  const taskStatus = taskStore.currentTask?.status

  if (taskStore.isRunning || chatStore.isStreaming) return 'running'
  if (taskStatus === 'failed') return 'danger'
  if (taskStatus === 'stopped' || taskStatus === 'waiting_permission') return 'warning'
  if (effectiveWorkspaceId.value) return 'ready'
  return 'idle'
})

const statusText = computed(() => {
  if (taskStore.isRunning) return 'Agent 正在执行任务'
  if (chatStore.isStreaming) return '模型正在输出内容'
  if (taskStore.currentTask?.status === 'failed') return '上一轮任务执行失败'
  if (taskStore.currentTask?.status === 'stopped') return '上一轮任务已停止'
  if (taskStore.currentTask?.status === 'waiting_permission') return '等待你确认后继续'
  if (effectiveWorkspace.value) return `当前工作区：${effectiveWorkspace.value.name}`
  return '未绑定工作区'
})

const canSend = computed(() => (!!inputText.value.trim() || attachments.value.length > 0) && !showStopButton.value)
const effectiveAiConfig = computed(() => aiSettingsStore.getEffectiveConfig(conversationStore.currentConversationId))
const currentProvider = computed(() => {
  const effective = effectiveAiConfig.value
  if (effective?.provider) return effective.provider
  const provider = settingsStore.providers.find((item) => item.id === (effective?.providerId ?? settingsStore.providerId))
  return provider ?? null
})
const currentProviderCapabilities = computed(() => {
  const provider = currentProvider.value
  if (!provider) return null
  return getProviderCapabilities(provider.provider_type, effectiveAiConfig.value?.modelName || provider.model_name)
})
const currentProviderCapabilityBadges = computed(() => {
  const provider = currentProvider.value
  if (!provider) return []
  return getProviderCapabilityBadges(provider.provider_type, effectiveAiConfig.value?.modelName || provider.model_name)
})
const providerCapabilitySummary = computed(() => {
  const provider = currentProvider.value
  if (!provider) return '未选择模型服务'
  return getProviderCapabilitySummary(provider.provider_type, effectiveAiConfig.value?.modelName || provider.model_name)
})
const canAttach = computed(() => {
  return currentProviderCapabilities.value?.supportsAttachments ?? false
})

const attachmentLabel = computed(() => {
  if (attachments.value.length === 0) return '添加附件'
  return `已附加 ${attachments.value.length} 个文件`
})
const currentPermissionMode = computed(() => {
  if (!effectiveWorkspaceId.value) return 'chat'
  const mode = currentConversation.value?.permission_mode
  if (mode === 'read' || mode === 'execute' || mode === 'command') return mode
  return settingsStore.defaultPermissionMode
})
const permissionModeHint = computed(() => {
  if (!effectiveWorkspaceId.value) return '未绑定工作区时仅聊天，不会调用本地工具。'
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
  return `${provider.name} · ${effectiveAiConfig.value?.modelName || provider.model_name}`
})

const conversationAiSettings = computed(() => aiSettingsStore.getConversationSettings(conversationStore.currentConversationId))
const aiConfigStatusText = computed(() => {
  const conversationId = conversationStore.currentConversationId
  if (!conversationId) return '继承默认 AI 配置'
  const explicitCount = Object.values(conversationAiSettings.value?.overrideMask ?? {}).filter(Boolean).length
  const legacyProviderCount =
    effectiveAiConfig.value?.source?.providerId === 'conversation' && !conversationAiSettings.value?.overrideMask?.providerId ? 1 : 0
  const count = explicitCount + legacyProviderCount
  return count > 0 ? `当前会话已覆盖 ${count} 项` : '继承默认 AI 配置'
})

const enabledSkillSuggestions = computed(() => {
  const query = skillQuery.value.toLowerCase()
  return skillsStore.skills
    .filter((skill) => skill.enabled)
    .filter((skill) => !query || skill.name.toLowerCase().includes(query) || skill.displayName.toLowerCase().includes(query))
    .slice(0, 8)
})

function draftNoticeText(source: ComposerDraftSource | null): string {
  if (source === 'command_failure') return '已填入命令失败诊断，可检查后发送'
  if (source === 'permission_rejection') return '已填入权限拒绝说明，可检查后发送'
  if (source === 'manual_plan') return '已填入人工处理方案草稿，可检查后发送'
  return '已填入继续处理草稿，可检查后发送'
}

watch(
  () => uiStore.composerDraft,
  async (value) => {
    if (!value) return
    const source = uiStore.composerDraftSource
    inputText.value = value
    uiStore.clearComposerDraft()
    draftNotice.value = draftNoticeText(source)
    if (draftNoticeTimer) {
      clearTimeout(draftNoticeTimer)
    }
    draftNoticeTimer = setTimeout(() => {
      draftNotice.value = ''
      draftNoticeTimer = null
    }, 3200)
    await nextTick()
    textareaRef.value?.focus()
    const length = inputText.value.length
    textareaRef.value?.setSelectionRange(length, length)
  }
)

watch(
  () => conversationStore.currentConversationId,
  (conversationId) => {
    if (conversationId) {
      aiSettingsStore.loadConversation(conversationId)
    }
  },
  { immediate: true }
)

watch(inputText, (value) => {
  const beforeCursor = value
  const match = beforeCursor.match(/(^|\s)\$([a-zA-Z0-9_-]*)$/)
  showSkillSuggest.value = !!match
  skillQuery.value = match?.[2] ?? ''
})

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
    if (effectiveWorkspaceId.value) {
      const taskId = await chatStore.sendAgentMessage(conversationId, content, {
        workspaceId: effectiveWorkspaceId.value,
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
  const workspace = await workspaceStore.selectWorkspace()
  const conversation = currentConversation.value
  if (!workspace || !conversation) return

  const workspaceUpdated = await conversationStore.updateConversationWorkspace(conversation.id, workspace.id)
  if (!workspaceUpdated) return

  if (conversation.permission_mode === 'chat') {
    await conversationStore.updateConversationPermissionMode(conversation.id, settingsStore.defaultPermissionMode)
  }

  await conversationStore.loadConversations()
}

function insertSkillRef(skillName: string) {
  const value = inputText.value
  const next = value.replace(/(^|\s)\$([a-zA-Z0-9_-]*)$/, `$1$${skillName} `)
  inputText.value = next === value ? `${value}$${skillName} ` : next
  showSkillSuggest.value = false
  nextTick(() => textareaRef.value?.focus())
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
  await aiSettingsStore.setConversationOverride(conversationId, { providerId: target.value || null }, { providerId: true })
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

async function overrideAiField(field: keyof AiConfigInfo, rawValue: string | number | boolean | null) {
  const conversationId = conversationStore.currentConversationId
  if (!conversationId) return
  const value = rawValue === '' ? null : rawValue
  await aiSettingsStore.setConversationOverride(conversationId, { [field]: value } as any, { [field]: true } as any)
}

function optionalNumberFromEvent(event: Event): number | null {
  const value = (event.target as HTMLInputElement | null)?.value ?? ''
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

async function inheritAiField(field: keyof AiConfigInfo) {
  const conversationId = conversationStore.currentConversationId
  if (!conversationId) return
  await aiSettingsStore.inheritConversationField(conversationId, field as any)
}

async function resetAiInheritance() {
  const conversationId = conversationStore.currentConversationId
  if (!conversationId) return
  await conversationStore.updateConversationProvider(conversationId, null)
  await aiSettingsStore.resetConversation(conversationId)
  await conversationStore.loadConversations()
}

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentPointerDown)
  skillsStore.loadSkills()
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleDocumentPointerDown)
  if (draftNoticeTimer) {
    clearTimeout(draftNoticeTimer)
  }
})
</script>

<template>
  <div class="chat-composer-wrap">
    <div class="chat-composer">
      <div class="composer-status" aria-live="polite">
        <span class="status-dot composer-status-dot" :class="`is-${statusTone}`" />
        <span>{{ statusText }}</span>
      </div>

      <div v-if="draftNotice" class="composer-draft-notice" aria-live="polite">
        <MessageSquareText :size="13" />
        <span>{{ draftNotice }}</span>
      </div>

      <textarea
        ref="textareaRef"
        v-model="inputText"
        @keydown.enter.exact.prevent="send"
        :disabled="showStopButton"
        :placeholder="effectiveWorkspaceId ? '描述你想让 TieX 在当前工作区完成的任务' : '输入你想讨论的问题，或先选择一个工作区'"
        aria-label="消息输入框"
      ></textarea>

      <div v-if="showSkillSuggest && enabledSkillSuggestions.length > 0" class="skill-suggest">
        <button
          v-for="skill in enabledSkillSuggestions"
          :key="skill.id"
          class="skill-suggest-item"
          @click="insertSkillRef(skill.name)"
        >
          <span class="skill-suggest-name">${{ skill.name }}</span>
          <span class="skill-suggest-desc">{{ skill.description || skill.displayName }}</span>
        </button>
      </div>

      <div class="composer-footer">
        <div class="composer-left">
          <button class="chip workspace-chip" @click="selectWorkspace">
            <FolderOpen :size="14" />
            {{ effectiveWorkspace?.name ?? '选择工作区' }}
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
              <div class="session-capability-panel">
                <div class="session-capability-summary">{{ providerCapabilitySummary }}</div>
                <div class="session-capability-strip">
                  <span
                    v-for="badge in currentProviderCapabilityBadges"
                    :key="badge.key"
                    class="session-capability-pill"
                    :class="{ off: !badge.enabled }"
                  >
                    {{ badge.label }}
                  </span>
                </div>
              </div>
              <div class="session-ai-panel">
                <div class="session-ai-head">
                  <span>{{ aiConfigStatusText }}</span>
                  <button class="mini-link" @click="resetAiInheritance">恢复继承</button>
                </div>
                <div class="session-ai-grid">
                  <label class="session-ai-field">
                    <span>Temperature</span>
                    <input
                      type="number"
                      min="0"
                      max="2"
                      step="0.1"
                      :value="effectiveAiConfig?.temperature ?? ''"
                      placeholder="默认"
                      @change="overrideAiField('temperature', optionalNumberFromEvent($event))"
                    />
                    <button v-if="aiSettingsStore.isOverridden(conversationStore.currentConversationId, 'temperature')" class="mini-link" @click="inheritAiField('temperature')">继承</button>
                  </label>
                  <label class="session-ai-field">
                    <span>Top P</span>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.05"
                      :value="effectiveAiConfig?.topP ?? ''"
                      placeholder="默认"
                      @change="overrideAiField('topP', optionalNumberFromEvent($event))"
                    />
                    <button v-if="aiSettingsStore.isOverridden(conversationStore.currentConversationId, 'topP')" class="mini-link" @click="inheritAiField('topP')">继承</button>
                  </label>
                  <label class="session-ai-field">
                    <span>输出上限</span>
                    <input
                      type="number"
                      min="1"
                      step="256"
                      :value="effectiveAiConfig?.maxTokens ?? ''"
                      placeholder="默认"
                      @change="overrideAiField('maxTokens', optionalNumberFromEvent($event))"
                    />
                    <button v-if="aiSettingsStore.isOverridden(conversationStore.currentConversationId, 'maxTokens')" class="mini-link" @click="inheritAiField('maxTokens')">继承</button>
                  </label>
                  <label class="session-ai-field">
                    <span>历史消息</span>
                    <input
                      type="number"
                      min="1"
                      max="200"
                      step="1"
                      :value="effectiveAiConfig?.contextMessageLimit ?? ''"
                      @change="overrideAiField('contextMessageLimit', optionalNumberFromEvent($event))"
                    />
                    <button v-if="aiSettingsStore.isOverridden(conversationStore.currentConversationId, 'contextMessageLimit')" class="mini-link" @click="inheritAiField('contextMessageLimit')">继承</button>
                  </label>
                </div>
                <div class="session-ai-switches">
                  <button
                    class="session-toggle"
                    :class="{ on: effectiveAiConfig?.streamEnabled !== false }"
                    @click="overrideAiField('streamEnabled', effectiveAiConfig?.streamEnabled === false)"
                  >
                    流式
                  </button>
                  <button
                    class="session-toggle"
                    :class="{ on: effectiveAiConfig?.toolsEnabled !== false }"
                    @click="overrideAiField('toolsEnabled', effectiveAiConfig?.toolsEnabled === false)"
                  >
                    工具
                  </button>
                </div>
              </div>
              <label class="composer-select-field session-field">
                <span class="field-label">权限模式</span>
                <select class="composer-select" :value="currentPermissionMode" @change="changePermissionMode" :disabled="!effectiveWorkspaceId">
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
          <div v-if="!canAttach" class="attachment-hint">{{ currentProviderCapabilities?.notes[0] ?? '切换到支持多模态的模型后可上传附件。' }}</div>
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

.composer-draft-notice {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 26px;
  margin: 0 0 8px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--sidebar-border));
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
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

.skill-suggest {
  display: grid;
  gap: 4px;
  max-height: 220px;
  overflow: auto;
  margin-top: 8px;
  padding: 6px;
  border-radius: 14px;
  border: 1px solid var(--sidebar-border);
  background: color-mix(in srgb, var(--sidebar-surface) 98%, transparent);
  box-shadow: 0 14px 30px rgba(34, 23, 15, 0.1);
}

.skill-suggest-item {
  display: grid;
  gap: 3px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 10px;
  text-align: left;
  background: transparent;
  color: var(--text);
}

.skill-suggest-item:hover {
  background: var(--sidebar-item-hover);
}

.skill-suggest-name {
  color: var(--accent);
  font-size: 12px;
  font-weight: 800;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
}

.skill-suggest-desc {
  color: var(--sidebar-text-muted);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  z-index: 80;
  width: min(300px, calc(100vw - 56px));
  max-height: min(240px, calc(100vh - 170px));
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px;
  border-radius: 16px;
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
  margin-top: 8px;
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
  margin-top: 8px;
}

.session-capability-panel {
  margin-top: 7px;
  padding: 8px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--sidebar-border) 72%, transparent);
  background: color-mix(in srgb, var(--sidebar-bg) 38%, transparent);
}

.session-capability-summary {
  color: var(--text-strong);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.35;
}

.session-capability-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 7px;
}

.session-capability-pill {
  display: inline-flex;
  align-items: center;
  min-height: 21px;
  padding: 0 7px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--success) 22%, var(--sidebar-border));
  background: color-mix(in srgb, var(--success) 8%, transparent);
  color: var(--success-strong);
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}

.session-capability-pill.off {
  border-color: color-mix(in srgb, var(--sidebar-border) 74%, transparent);
  background: color-mix(in srgb, var(--sidebar-bg) 34%, transparent);
  color: var(--muted);
}

.session-ai-panel {
  margin-top: 8px;
  padding: 8px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--sidebar-border) 72%, transparent);
  background: color-mix(in srgb, var(--sidebar-bg) 34%, transparent);
}

.session-ai-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--text-strong);
  font-size: 12px;
  font-weight: 700;
}

.mini-link {
  border: 0;
  background: transparent;
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.session-ai-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 9px;
}

.session-ai-field {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.session-ai-field span {
  color: var(--sidebar-text-muted);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}

.session-ai-field input {
  width: 100%;
  min-height: 32px;
  border-radius: 9px;
  border: 1px solid var(--sidebar-border);
  background: color-mix(in srgb, var(--sidebar-bg) 42%, transparent);
  color: var(--text);
  padding: 0 8px;
}

.session-ai-switches {
  display: flex;
  gap: 7px;
  margin-top: 9px;
}

.session-toggle {
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--sidebar-border);
  background: transparent;
  color: var(--sidebar-text-muted);
  font-size: 11px;
  font-weight: 700;
}

.session-toggle.on {
  border-color: color-mix(in srgb, var(--success) 22%, var(--sidebar-border));
  background: color-mix(in srgb, var(--success) 8%, transparent);
  color: var(--success-strong);
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

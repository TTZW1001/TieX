<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useChatStore } from '@/stores/chat.store'
import { useConversationStore } from '@/stores/conversation.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { useAiSettingsStore } from '@/stores/ai-settings.store'
import { useSkillsStore } from '@/stores/skills.store'
import { useUiStore } from '@/stores/ui.store'
import { getProviderCapabilityBadges, getProviderCapabilitySummary } from '@/utils/provider-capabilities'
import { FolderOpen, Send, SlidersHorizontal, X } from 'lucide-vue-next'
import type { AiConfigInfo } from '@/types/global'

const router = useRouter()
const chatStore = useChatStore()
const conversationStore = useConversationStore()
const settingsStore = useSettingsStore()
const workspaceStore = useWorkspaceStore()
const aiSettingsStore = useAiSettingsStore()
const skillsStore = useSkillsStore()
const uiStore = useUiStore()

const inputText = ref('')
const animatedTitle = ref('')
const heroTemplateIndex = ref(0)
const showSessionConfig = ref(false)
const showSkillSuggest = ref(false)
const skillQuery = ref('')
const sessionConfigWrap = ref<HTMLElement | null>(null)
const draftAiConfig = ref<Partial<AiConfigInfo>>({})
const draftPermissionMode = ref<'chat' | 'read' | 'execute' | 'command' | null>(null)
let typingTimer: ReturnType<typeof setTimeout> | null = null
const canCreateConversation = computed(() => !!inputText.value.trim())
const workspaceLabel = computed(() => (workspaceStore.hasWorkspace ? workspaceStore.currentWorkspaceName : '选择工作区'))
const statusLabel = computed(() => (workspaceStore.hasWorkspace ? '已连接本地工作区' : '未绑定工作区'))
const heroSubject = computed(() => (workspaceStore.hasWorkspace ? workspaceStore.currentWorkspaceName : 'TieX'))
const heroUserName = computed(() => settingsStore.userDisplayName.trim())
const heroTitleTemplates = [
  '{username}，我们应该在{workspace}做什么？',
  '{username}，{timeGreeting}！',
  '{username}，今天有什么计划？',
  '你好！{username}🙂',
  '{username}，欢迎回来！',
  '{username}，有什么需要我帮忙的？',
  '{username}，{workspace}一切就绪。',
  '{username}，今天状态如何？',
]

function getTimeGreeting() {
  const hour = new Date().getHours()
  if (hour < 11) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

function renderHeroTitle(template: string) {
  const username = heroUserName.value || '你好'
  return template
    .split('{username}')
    .join(username)
    .split('{workspace}')
    .join(heroSubject.value)
    .split('{timeGreeting}')
    .join(getTimeGreeting())
}

const heroTitle = computed(() => renderHeroTitle(heroTitleTemplates[heroTemplateIndex.value] ?? heroTitleTemplates[0]))
const draftEffectiveAiConfig = computed<AiConfigInfo>(() => ({
  ...aiSettingsStore.defaultConfig,
  ...draftAiConfig.value,
}))
const draftProviderId = computed(() => draftEffectiveAiConfig.value.providerId ?? settingsStore.providerId)
const draftProvider = computed(() => {
  const provider = settingsStore.providers.find((item) => item.id === draftProviderId.value)
  return provider ?? settingsStore.providers[0] ?? null
})
const draftProviderModelLabel = computed(() => {
  const provider = draftProvider.value
  if (!provider) return '未选择模型服务'
  return `${provider.name} · ${draftEffectiveAiConfig.value.modelName || provider.model_name}`
})
const draftProviderBadges = computed(() => {
  const provider = draftProvider.value
  if (!provider) return []
  return getProviderCapabilityBadges(provider.provider_type, draftEffectiveAiConfig.value.modelName || provider.model_name)
})
const draftProviderSummary = computed(() => {
  const provider = draftProvider.value
  if (!provider) return '未选择模型服务'
  return getProviderCapabilitySummary(provider.provider_type, draftEffectiveAiConfig.value.modelName || provider.model_name)
})
const draftAiOverrideCount = computed(() => Object.keys(draftAiConfig.value).length)
const draftAiStatusText = computed(() => (draftAiOverrideCount.value > 0 ? `新会话已覆盖 ${draftAiOverrideCount.value} 项` : '新会话继承默认 AI 配置'))
const draftPermissionValue = computed(() => {
  if (draftPermissionMode.value) return draftPermissionMode.value
  return workspaceStore.hasWorkspace ? settingsStore.defaultPermissionMode : 'chat'
})
const enabledSkillSuggestions = computed(() => {
  const query = skillQuery.value.toLowerCase()
  return skillsStore.skills
    .filter((skill) => skill.enabled)
    .filter((skill) => !query || skill.name.toLowerCase().includes(query) || skill.displayName.toLowerCase().includes(query))
    .slice(0, 8)
})

async function selectWorkspace() {
  await workspaceStore.selectWorkspace()
}

async function createConversationFromInput() {
  const content = inputText.value.trim()
  if (!content) return

  const aiOverrides = { ...draftAiConfig.value }
  const conv = await conversationStore.createConversation({
    title: content.slice(0, 30),
    workspace_id: workspaceStore.currentWorkspaceId,
    permission_mode: draftPermissionValue.value,
  })

  if (!conv) return

  if (Object.keys(aiOverrides).length > 0) {
    if (aiOverrides.providerId !== undefined) {
      await conversationStore.updateConversationProvider(conv.id, aiOverrides.providerId ?? null)
    }
    await aiSettingsStore.setConversationOverride(
      conv.id,
      aiOverrides,
      Object.fromEntries(Object.keys(aiOverrides).map((key) => [key, true])) as Partial<Record<keyof AiConfigInfo, boolean>>
    )
  }

  conversationStore.setCurrentConversation(conv.id)
  inputText.value = ''
  showSkillSuggest.value = false
  showSessionConfig.value = false
  await router.push(`/conversation/${conv.id}`)

  try {
    if (workspaceStore.currentWorkspaceId) {
      await chatStore.sendAgentMessage(conv.id, content, {
        workspaceId: workspaceStore.currentWorkspaceId,
      })
    } else {
      await chatStore.sendMessage(conv.id, content)
    }

    conversationStore.loadConversations()
  } catch (err) {
    console.error('Failed to create conversation from home input:', err)
    await uiStore.confirm({
      title: '发送失败',
      message: '新会话已创建，但首条消息没有发送成功。',
      detail: err instanceof Error ? err.message : String(err || '未知错误'),
      variant: 'warning',
      confirmText: '知道了',
      cancelText: '关闭',
    })
  }
}

function fillPrompt(value: string) {
  inputText.value = value
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

function changeDraftProvider(event: Event) {
  const value = (event.target as HTMLSelectElement | null)?.value || null
  draftAiConfig.value = { ...draftAiConfig.value, providerId: value }
}

function changeDraftPermission(event: Event) {
  const value = (event.target as HTMLSelectElement | null)?.value as 'chat' | 'read' | 'execute' | 'command'
  draftPermissionMode.value = value
}

function overrideDraftAiField(field: keyof AiConfigInfo, rawValue: string | number | boolean | null) {
  const value = rawValue === '' ? null : rawValue
  draftAiConfig.value = { ...draftAiConfig.value, [field]: value }
}

function optionalNumberFromEvent(event: Event): number | null {
  const value = (event.target as HTMLInputElement | null)?.value ?? ''
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function resetDraftAiConfig() {
  draftAiConfig.value = {}
}

function insertSkillRef(name: string) {
  const text = inputText.value
  const match = text.match(/(^|\s)\$([a-zA-Z0-9_-]*)$/)
  if (!match) {
    inputText.value = `${text}${text.endsWith(' ') || text.length === 0 ? '' : ' '}$${name} `
  } else {
    const start = match.index ?? 0
    inputText.value = `${text.slice(0, start)}${match[1]}$${name} `
  }
  showSkillSuggest.value = false
}

function startTypewriter(text: string) {
  if (typingTimer) {
    clearTimeout(typingTimer)
    typingTimer = null
  }
  animatedTitle.value = ''
  let index = 0

  const tick = () => {
    animatedTitle.value = text.slice(0, index)
    index += 1
    if (index <= text.length) {
      typingTimer = setTimeout(tick, index < 6 ? 70 : 42)
    } else {
      typingTimer = null
    }
  }

  tick()
}

onMounted(() => {
  heroTemplateIndex.value = Math.floor(Math.random() * heroTitleTemplates.length)
  document.addEventListener('mousedown', handleDocumentPointerDown)
  settingsStore.loadProviders()
  aiSettingsStore.loadDefault()
  skillsStore.loadSkills()
  workspaceStore.loadWorkspaces()
  conversationStore.loadConversations()
  startTypewriter(heroTitle.value)
})

watch(heroTitle, (value) => {
  startTypewriter(value)
})

watch(inputText, (value) => {
  const match = value.match(/(^|\s)\$([a-zA-Z0-9_-]*)$/)
  showSkillSuggest.value = Boolean(match)
  skillQuery.value = match?.[2] ?? ''
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleDocumentPointerDown)
  if (typingTimer) {
    clearTimeout(typingTimer)
    typingTimer = null
  }
})
</script>

<template>
  <div class="home">
    <section class="home-center">
      <h1>{{ animatedTitle }}<span class="type-caret" aria-hidden="true"></span></h1>
      <p class="hero-copy">把项目、文档、命令和审批放进同一个本地 AI 工作台。</p>

      <div class="hero-status" aria-live="polite">
        <div class="status-pill status-live">
          <span class="status-dot" />
          <span>{{ statusLabel }}</span>
        </div>
      </div>

      <div class="prompt-shell">
        <textarea
          v-model="inputText"
          placeholder="例如：检查当前项目结构、生成说明文档，或修复一个具体问题"
          aria-label="输入任务"
          @keydown.enter.exact.prevent="createConversationFromInput"
        />

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

        <div class="prompt-footer">
          <div class="prompt-left">
            <button class="chip workspace-chip" @click="selectWorkspace">
              <FolderOpen :size="14" />
              <span>{{ workspaceLabel }}</span>
            </button>
            <div ref="sessionConfigWrap" class="session-config-wrap">
              <button class="chip session-config-trigger" @click="toggleSessionConfig">
                <SlidersHorizontal :size="14" />
                <span>会话设置</span>
              </button>
              <div v-if="showSessionConfig" class="session-config-popover">
                <div class="session-config-head">
                  <span>新会话设置</span>
                  <button class="popover-close" @click="showSessionConfig = false">
                    <X :size="12" />
                  </button>
                </div>
                <label class="session-field">
                  <span class="field-label">模型服务</span>
                  <select class="session-select" :value="draftProviderId ?? ''" @change="changeDraftProvider">
                    <option v-for="item in settingsStore.providers" :key="item.id" :value="item.id">
                      {{ item.name }}
                    </option>
                  </select>
                </label>
                <div class="session-model-pill" :title="draftProviderModelLabel">{{ draftProviderModelLabel }}</div>
                <div class="session-capability-panel">
                  <div class="session-capability-summary">{{ draftProviderSummary }}</div>
                  <div class="session-capability-strip">
                    <span
                      v-for="badge in draftProviderBadges"
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
                    <span>{{ draftAiStatusText }}</span>
                    <button class="mini-link" @click="resetDraftAiConfig">恢复继承</button>
                  </div>
                  <div class="session-ai-grid">
                    <label class="session-ai-field">
                      <span>Temperature</span>
                      <input
                        type="number"
                        min="0"
                        max="2"
                        step="0.1"
                        :value="draftEffectiveAiConfig.temperature ?? ''"
                        placeholder="默认"
                        @change="overrideDraftAiField('temperature', optionalNumberFromEvent($event))"
                      />
                    </label>
                    <label class="session-ai-field">
                      <span>Top P</span>
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        :value="draftEffectiveAiConfig.topP ?? ''"
                        placeholder="默认"
                        @change="overrideDraftAiField('topP', optionalNumberFromEvent($event))"
                      />
                    </label>
                    <label class="session-ai-field">
                      <span>输出上限</span>
                      <input
                        type="number"
                        min="1"
                        step="256"
                        :value="draftEffectiveAiConfig.maxTokens ?? ''"
                        placeholder="默认"
                        @change="overrideDraftAiField('maxTokens', optionalNumberFromEvent($event))"
                      />
                    </label>
                    <label class="session-ai-field">
                      <span>历史消息</span>
                      <input
                        type="number"
                        min="1"
                        max="200"
                        step="1"
                        :value="draftEffectiveAiConfig.contextMessageLimit ?? ''"
                        @change="overrideDraftAiField('contextMessageLimit', optionalNumberFromEvent($event))"
                      />
                    </label>
                  </div>
                  <div class="session-ai-switches">
                    <button
                      class="session-toggle"
                      :class="{ on: draftEffectiveAiConfig.streamEnabled !== false }"
                      @click="overrideDraftAiField('streamEnabled', draftEffectiveAiConfig.streamEnabled === false)"
                    >
                      流式
                    </button>
                    <button
                      class="session-toggle"
                      :class="{ on: draftEffectiveAiConfig.toolsEnabled !== false }"
                      @click="overrideDraftAiField('toolsEnabled', draftEffectiveAiConfig.toolsEnabled === false)"
                    >
                      工具
                    </button>
                  </div>
                </div>
                <label class="session-field">
                  <span class="field-label">权限模式</span>
                  <select class="session-select" :value="draftPermissionValue" @change="changeDraftPermission" :disabled="!workspaceStore.hasWorkspace">
                    <option value="chat">聊天</option>
                    <option value="read">只读</option>
                    <option value="execute">改文件</option>
                    <option value="command">命令执行</option>
                  </select>
                </label>
                <div class="session-hint">
                  {{ workspaceStore.hasWorkspace ? '创建后会应用到本轮新会话。' : '未绑定工作区时只使用聊天模式。' }}
                </div>
              </div>
            </div>
          </div>
          <button class="send-btn home-send" @click="createConversationFromInput" :disabled="!canCreateConversation">
            <Send :size="16" />
            <span>开始</span>
          </button>
        </div>
      </div>

      <div class="quick-actions">
        <button class="quick-action" @click="fillPrompt('梳理当前项目结构并说明关键模块')">梳理项目结构</button>
        <button class="quick-action" @click="fillPrompt('为当前项目生成一份使用说明文档')">生成使用文档</button>
        <button class="quick-action" @click="fillPrompt('检查当前项目中的问题并开始修复')">检查并修复</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home {
  height: 100%;
  overflow: auto;
  background:
    radial-gradient(circle at 50% 18%, color-mix(in srgb, var(--accent) 4%, transparent), transparent 24%),
    var(--bg);
  color: var(--text);
}

.home-center {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 132px 24px 88px;
}

h1 {
  margin: 0 0 20px;
  font-size: clamp(24px, 3.2vw, 40px);
  line-height: 1.2;
  font-weight: 600;
  text-align: center;
  letter-spacing: -0.035em;
  color: var(--text-strong);
  min-height: 1.3em;
  position: relative;
  max-width: 920px;
}

.type-caret {
  display: inline-block;
  width: 0.7ch;
  border-right: 2px solid color-mix(in srgb, var(--accent) 70%, var(--text-strong));
  margin-left: 2px;
  transform: translateY(2px);
  animation: typeBlink 1s steps(1) infinite;
}

.hero-copy {
  margin: 0 0 18px;
  color: var(--body);
  font-size: 16px;
  text-align: center;
}

.hero-status {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  margin-bottom: 18px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--sidebar-border);
  background: color-mix(in srgb, var(--sidebar-surface) 92%, transparent);
  color: var(--sidebar-text);
  font-size: 12px;
}

.status-live {
  color: var(--success-strong);
}

.prompt-shell {
  width: min(820px, 92%);
  overflow: visible;
  position: relative;
  border-radius: 28px;
  background: color-mix(in srgb, var(--sidebar-surface) 96%, transparent);
  border: 1px solid var(--sidebar-border);
  box-shadow: var(--shadow-soft);
  animation: homeRise var(--duration-slow) var(--ease-out);
}

.prompt-shell:focus-within {
  border-color: color-mix(in srgb, var(--accent) 20%, var(--sidebar-border));
  box-shadow: 0 20px 38px rgba(34, 23, 15, 0.08);
}

.prompt-shell textarea {
  width: 100%;
  min-height: 114px;
  padding: 22px 22px 0;
  resize: none;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font-size: 16px;
  line-height: 1.75;
}

.prompt-shell textarea:focus-visible {
  box-shadow: none;
}

.prompt-shell textarea::placeholder {
  color: var(--muted-soft);
}

.prompt-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 22px 22px;
}

.prompt-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex-wrap: wrap;
}

.workspace-chip {
  max-width: 320px;
}

.workspace-chip span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.home-send {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.skill-suggest {
  display: grid;
  gap: 4px;
  max-height: 212px;
  overflow: auto;
  margin: 8px 22px 0;
  padding: 6px;
  border-radius: 14px;
  border: 1px solid var(--sidebar-border);
  background: color-mix(in srgb, var(--sidebar-surface) 98%, transparent);
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

.session-config-wrap {
  position: relative;
}

.session-config-trigger {
  max-width: 220px;
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
  background: color-mix(in srgb, var(--sidebar-surface) 98%, var(--bg));
  box-shadow: var(--shadow-soft);
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
  width: 24px;
  height: 24px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: var(--sidebar-text-muted);
}

.popover-close:hover {
  background: var(--sidebar-item-hover);
  color: var(--text-strong);
}

.session-field {
  display: grid;
  gap: 5px;
  margin-top: 8px;
}

.field-label {
  color: var(--sidebar-text-muted);
  font-size: 11px;
  font-weight: 700;
}

.session-select {
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--sidebar-border);
  background: color-mix(in srgb, var(--sidebar-bg) 42%, transparent);
  color: var(--text);
}

.session-select:disabled {
  opacity: 0.55;
}

.session-model-pill {
  display: inline-flex;
  align-items: center;
  width: 100%;
  min-height: 30px;
  margin-top: 7px;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid var(--sidebar-border);
  color: var(--sidebar-text);
  font-size: 12px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.session-capability-panel {
  margin-top: 7px;
  padding: 8px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--sidebar-border) 72%, transparent);
  background: color-mix(in srgb, var(--sidebar-bg) 34%, transparent);
}

.session-capability-summary {
  color: var(--sidebar-text-muted);
  font-size: 11px;
  line-height: 1.5;
}

.session-capability-strip,
.session-ai-switches {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 7px;
}

.session-capability-pill,
.session-toggle {
  min-height: 26px;
  padding: 0 9px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--success) 22%, var(--sidebar-border));
  background: color-mix(in srgb, var(--success) 8%, transparent);
  color: var(--success-strong);
  font-size: 11px;
  font-weight: 700;
}

.session-capability-pill.off,
.session-toggle {
  border-color: var(--sidebar-border);
  background: transparent;
  color: var(--sidebar-text-muted);
}

.session-toggle.on {
  border-color: color-mix(in srgb, var(--success) 22%, var(--sidebar-border));
  background: color-mix(in srgb, var(--success) 8%, transparent);
  color: var(--success-strong);
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
  gap: 7px;
  margin-top: 8px;
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
  min-height: 30px;
  border-radius: 9px;
  border: 1px solid var(--sidebar-border);
  background: color-mix(in srgb, var(--sidebar-bg) 42%, transparent);
  color: var(--text);
  padding: 0 8px;
}

.session-hint {
  margin-top: 8px;
  font-size: 11px;
  color: var(--sidebar-text-muted);
  line-height: 1.5;
}

.quick-actions {
  width: min(820px, 92%);
  display: flex;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 18px;
}

.quick-action {
  padding: 9px 14px;
  border-radius: 999px;
  border: 1px solid var(--sidebar-border);
  background: color-mix(in srgb, var(--sidebar-surface) 92%, transparent);
  color: var(--sidebar-text);
  font-size: 12px;
  font-weight: 500;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
}

.quick-action:hover {
  background: var(--sidebar-item-hover);
  border-color: color-mix(in srgb, var(--sidebar-text-soft) 16%, var(--sidebar-border));
  color: var(--text-strong);
}

@keyframes homeRise {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes typeBlink {
  0%,
  49% {
    opacity: 1;
  }
  50%,
  100% {
    opacity: 0;
  }
}

@media (max-width: 820px) {
  .home-center {
    padding-top: 96px;
  }

  .prompt-shell textarea {
    min-height: 104px;
    font-size: 15px;
  }

  .prompt-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .prompt-left {
    align-items: stretch;
  }
}
</style>

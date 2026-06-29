<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useChatStore } from '@/stores/chat.store'
import { useConversationStore } from '@/stores/conversation.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { FolderOpen, Send } from 'lucide-vue-next'

const router = useRouter()
const chatStore = useChatStore()
const conversationStore = useConversationStore()
const settingsStore = useSettingsStore()
const workspaceStore = useWorkspaceStore()

const inputText = ref('')
const animatedTitle = ref('')
const heroTemplateIndex = ref(0)
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

async function selectWorkspace() {
  await workspaceStore.selectWorkspace()
}

async function createConversationFromInput() {
  const content = inputText.value.trim()
  if (!content) return

  const conv = await conversationStore.createConversation({
    title: content.slice(0, 30),
    workspace_id: workspaceStore.currentWorkspaceId,
    permission_mode: workspaceStore.hasWorkspace ? settingsStore.defaultPermissionMode : 'chat',
  })

  if (!conv) return

  conversationStore.setCurrentConversation(conv.id)
  inputText.value = ''
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
  }
}

function fillPrompt(value: string) {
  inputText.value = value
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
  workspaceStore.loadWorkspaces()
  conversationStore.loadConversations()
  startTypewriter(heroTitle.value)
})

watch(heroTitle, (value) => {
  startTypewriter(value)
})

onBeforeUnmount(() => {
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

        <div class="prompt-footer">
          <button class="chip workspace-chip" @click="selectWorkspace">
            <FolderOpen :size="14" />
            <span>{{ workspaceLabel }}</span>
          </button>
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
  overflow: hidden;
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
}
</style>

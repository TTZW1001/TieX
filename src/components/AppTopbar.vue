<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app.store'
import { useConversationStore } from '@/stores/conversation.store'
import { useUiStore } from '@/stores/ui.store'
import { ArrowLeft, ArrowRight, Sun, Moon, Minus, Square, X, PanelRightClose, PanelRightOpen } from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const appStore = useAppStore()
const conversationStore = useConversationStore()
const uiStore = useUiStore()

const pageTitle = computed(() => {
  if (route.name === 'home') return '新对话'
  if (route.name === 'settings') {
    const sectionTitles: Record<string, string> = {
      provider: '模型服务',
      permissions: '任务与权限',
      agents: '多 Agent',
      memory: '记忆与偏好',
      data: '本地数据',
      stats: '使用统计',
    }
    const section = String(route.params.section ?? 'provider')
    return `设置 · ${sectionTitles[section] ?? '模型服务'}`
  }
  if (route.name === 'conversation') {
    const conv = conversationStore.conversations.find(
      (c) => c.id === conversationStore.currentConversationId
    )
    return conv?.title ?? '会话'
  }
  return 'TieX'
})

function toggleTheme(event: MouseEvent) {
  // 使用 View Transition API 实现圆形扩散切换
  appStore.toggleThemeWithTransition(event)
}

const themeIcon = computed(() => {
  if (appStore.currentTheme === 'dark') return Moon
  if (appStore.currentTheme === 'light') return Sun
  return appStore.isDark ? Moon : Sun
})

const themeLabel = computed(() => {
  if (appStore.currentTheme === 'dark') return '深色'
  if (appStore.currentTheme === 'light') return '浅色'
  return '跟随系统'
})

function goBack() {
  router.back()
}

function goForward() {
  router.forward()
}

function minimizeWindow() {
  window.tiex.window.minimize()
}

function maximizeWindow() {
  window.tiex.window.maximize()
}

function closeWindow() {
  window.tiex.window.close()
}

const drawerIcon = computed(() => (uiStore.drawerOpen ? PanelRightClose : PanelRightOpen))
</script>

<template>
  <header class="topbar">
    <div class="topbar-left">
      <button class="nav-btn" title="返回" @click="goBack">
        <ArrowLeft :size="15" />
      </button>
      <button class="nav-btn" title="前进" @click="goForward">
        <ArrowRight :size="15" />
      </button>
      <div class="title-group">
        <div class="title-kicker">TieX</div>
        <div class="thread-title">{{ pageTitle }}</div>
      </div>
    </div>
    <div class="topbar-right">
      <button class="nav-btn subtle-btn" :title="uiStore.drawerOpen ? '收起任务面板' : '打开任务面板'" @click="uiStore.toggleDrawer">
        <component :is="drawerIcon" :size="15" />
      </button>
      <button class="theme-toggle" :title="themeLabel" @click="toggleTheme">
        <component :is="themeIcon" :size="15" />
      </button>
      <div class="window-controls">
        <button class="window-btn" title="最小化" @click="minimizeWindow">
          <Minus :size="14" />
        </button>
        <button class="window-btn" title="最大化" @click="maximizeWindow">
          <Square :size="13" />
        </button>
        <button class="window-btn close-btn" title="关闭" @click="closeWindow">
          <X :size="14" />
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  height: var(--topbar-height);
  border-bottom: 1px solid var(--sidebar-border);
  display: flex;
  align-items: center;
  padding: 0 18px;
  background: var(--topbar-bg);
  backdrop-filter: blur(10px);
  -webkit-app-region: drag;
}

.topbar-left,
.topbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  -webkit-app-region: no-drag;
}

.topbar-left {
  min-width: 0;
}

.topbar-right {
  margin-left: auto;
  gap: 8px;
}

.title-group {
  display: flex;
  flex-direction: column;
  min-width: 0;
  margin-left: 10px;
}

.title-kicker {
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--topbar-text-soft);
  font-weight: 700;
  line-height: 1;
}

.thread-title {
  margin-top: 4px;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.15;
  color: var(--topbar-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-btn,
.window-btn,
.theme-toggle {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  border: 1px solid transparent;
  color: var(--topbar-text-soft);
  background: transparent;
  display: grid;
  place-items: center;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease, transform 120ms ease;
}

.nav-btn:hover,
.window-btn:hover,
.theme-toggle:hover {
  background: color-mix(in srgb, var(--topbar-pill-bg) 94%, transparent);
  border-color: var(--sidebar-border);
  color: var(--topbar-text);
}

.subtle-btn {
  opacity: 0.9;
}

.window-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 4px;
}

.close-btn:hover {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}

.theme-toggle {
  color: var(--topbar-text);
  background: color-mix(in srgb, var(--topbar-pill-bg) 90%, transparent);
  border-color: color-mix(in srgb, var(--topbar-text-soft) 18%, var(--sidebar-border));
}

.theme-toggle:hover {
  background: color-mix(in srgb, var(--topbar-pill-bg) 100%, transparent);
  color: var(--topbar-text);
  transform: translateY(-1px);
}

[data-theme='dark'] .theme-toggle:hover {
  color: var(--topbar-text);
}

@media (max-width: 900px) {
  .title-kicker {
    display: none;
  }

}
</style>

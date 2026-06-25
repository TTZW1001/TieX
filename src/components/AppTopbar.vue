<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app.store'
import { useConversationStore } from '@/stores/conversation.store'
import { ArrowLeft, ArrowRight, Sun, Moon, Minus, Square, X } from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const appStore = useAppStore()
const conversationStore = useConversationStore()

const pageTitle = computed(() => {
  if (route.name === 'home') return '新对话'
  if (route.name === 'settings') return '设置'
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
</script>

<template>
  <header class="topbar">
    <div class="topbar-left">
      <button class="icon-btn" title="返回" @click="goBack">
        <ArrowLeft :size="16" />
      </button>
      <button class="icon-btn" title="前进" @click="goForward">
        <ArrowRight :size="16" />
      </button>
      <div class="title-group">
        <div class="title-kicker">TieX</div>
        <div class="thread-title">{{ pageTitle }}</div>
      </div>
    </div>
    <div class="topbar-right">
      <span class="badge">DeepSeek</span>
      <button class="icon-btn theme-toggle" :title="themeLabel" @click="toggleTheme">
        <component :is="themeIcon" :size="16" />
      </button>
      <div class="window-controls">
        <button class="icon-btn window-btn" title="最小化" @click="minimizeWindow">
          <Minus :size="14" />
        </button>
        <button class="icon-btn window-btn" title="最大化" @click="maximizeWindow">
          <Square :size="13" />
        </button>
        <button class="icon-btn window-btn close-btn" title="关闭" @click="closeWindow">
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
  padding: 0 22px;
  background: var(--topbar-bg);
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
}

.title-group {
  display: flex;
  flex-direction: column;
  min-width: 0;
  margin-left: 6px;
}

.title-kicker {
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--topbar-text-soft);
  font-weight: 700;
  opacity: 0.8;
}

.thread-title {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--topbar-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.badge {
  padding: 8px 14px;
  border-radius: 999px;
  background: var(--topbar-pill-bg);
  color: var(--topbar-text);
  font-size: 12px;
  border: 1px solid var(--sidebar-border);
}

.window-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 6px;
}

.window-btn {
  width: 32px;
  height: 32px;
}

.close-btn:hover {
  background: var(--danger);
  color: var(--on-accent);
}

.theme-toggle {
  color: var(--topbar-text-soft);
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease, color 0.2s ease;
}

.theme-toggle:hover {
  background: var(--accent-soft);
  color: var(--accent);
  transform: rotate(20deg);
}

[data-theme='dark'] .theme-toggle:hover {
  color: var(--on-accent);
}

@media (max-width: 900px) {
  .title-kicker {
    display: none;
  }

  .badge {
    padding-inline: 12px;
  }
}
</style>

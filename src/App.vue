<script setup lang="ts">
import { onMounted } from 'vue'
import { useAppStore } from '@/stores/app.store'
import { useUiStore } from '@/stores/ui.store'
import { useConversationStore } from '@/stores/conversation.store'
import { useSettingsStore } from '@/stores/settings.store'
import AppLayout from '@/layouts/AppLayout.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const appStore = useAppStore()
const uiStore = useUiStore()
const conversationStore = useConversationStore()
const settingsStore = useSettingsStore()

onMounted(async () => {
  // 先加载设置，后初始化主题，避免首次渲染与持久化值短暂不同步。
  await settingsStore.loadFromDb()
  // 初始化主题（从数据库读取）
  await appStore.initTheme()
  // 初始化侧边栏状态（从数据库读取）
  await uiStore.initSidebarState()
  // 加载会话列表（从数据库读取）
  await conversationStore.loadConversations()
  appStore.initialized = true
})
</script>

<template>
  <AppLayout />
  <ConfirmDialog />
</template>

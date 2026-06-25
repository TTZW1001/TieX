<script setup lang="ts">
import { computed, ref, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useUiStore } from '@/stores/ui.store'
import { useConversationStore } from '@/stores/conversation.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  FolderOpen,
  Search,
  Library,
  Clock3,
  MoreHorizontal,
  Pencil,
  Trash2,
  Check,
  X,
} from 'lucide-vue-next'
import WorkspaceSelector from './WorkspaceSelector.vue'

const appIconUrl = new URL('../../icon.png', import.meta.url).href
const router = useRouter()
const uiStore = useUiStore()
const conversationStore = useConversationStore()
const workspaceStore = useWorkspaceStore()

const recentConversations = computed(() => conversationStore.conversations.slice(0, 12))
const workspaceList = computed(() => workspaceStore.workspaces.slice(0, 6))

// —— 会话列表的更多菜单状态 ——
const openMenuId = ref<string | null>(null)
const renamingId = ref<string | null>(null)
const renameValue = ref('')
const renameInputRef = ref<HTMLInputElement | null>(null)

function goHome() {
  conversationStore.setCurrentConversation(null)
  router.push('/home')
}

async function openConversation(id: string) {
  // 处于重命名态时不触发切换
  if (renamingId.value === id) return
  if (openMenuId.value) {
    openMenuId.value = null
    return
  }
  conversationStore.setCurrentConversation(id)
  router.push(`/conversation/${id}`)
}

async function createNewConversation() {
  if (uiStore.sidebarCollapsed) {
    uiStore.toggleSidebar()
    return
  }

  const conv = await conversationStore.createConversation()
  if (conv) {
    conversationStore.setCurrentConversation(conv.id)
    router.push(`/conversation/${conv.id}`)
  }
}

function goSettings() {
  router.push('/settings')
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return '刚刚'
  if (diffMins < 60) return `${diffMins} 分`
  if (diffHours < 24) return `${diffHours} 小时`
  if (diffDays < 7) return `${diffDays} 天`
  return date.toLocaleDateString('zh-CN')
}

// —— 更多菜单：展开 / 收起 ——
function toggleMenu(event: MouseEvent, id: string) {
  event.stopPropagation()
  openMenuId.value = openMenuId.value === id ? null : id
}

function closeMenu() {
  openMenuId.value = null
}

// —— 重命名 ——
const savingRenameId = ref<string | null>(null)
const renameError = ref<string | null>(null)

function startRename(event: MouseEvent, conv: { id: string; title: string }) {
  event.stopPropagation()
  renamingId.value = conv.id
  renameValue.value = conv.title
  renameError.value = null
  openMenuId.value = null
  nextTick(() => {
    renameInputRef.value?.focus()
    renameInputRef.value?.select()
  })
}

async function commitRename() {
  const id = renamingId.value
  if (!id) return
  // 防止重复触发（保存中或已经退出编辑）
  if (savingRenameId.value) return
  const newTitle = renameValue.value.trim()
  // 没变化也直接退出
  const original = conversationStore.conversations.find((c) => c.id === id)?.title ?? ''
  if (newTitle === original) {
    renamingId.value = null
    renameValue.value = ''
    return
  }
  if (!newTitle) {
    renameError.value = '标题不能为空'
    return
  }

  savingRenameId.value = id
  renameError.value = null
  try {
    const ok = await conversationStore.renameConversation(id, newTitle)
    if (!ok) {
      renameError.value = '保存失败，请稍后重试'
      return
    }
    renamingId.value = null
    renameValue.value = ''
  } catch (err: any) {
    console.error('rename failed', err)
    renameError.value = `保存失败：${err?.message || err || '未知错误'}`
  } finally {
    savingRenameId.value = null
  }
}

function cancelRename() {
  renamingId.value = null
  renameValue.value = ''
  renameError.value = null
  savingRenameId.value = null
}

// —— 删除 ——
async function confirmDelete(event: MouseEvent, conv: { id: string; title: string }) {
  event.stopPropagation()
  openMenuId.value = null

  const ok = await uiStore.confirm({
    title: '删除会话',
    message: `确定要删除会话"${conv.title || '未命名'}"吗？`,
    detail: '该会话下的所有消息、任务和生成的文档都将被一并清除，且无法恢复。',
    variant: 'danger',
    confirmText: '删除',
    cancelText: '取消',
  })
  if (!ok) return

  const wasCurrent = conversationStore.currentConversationId === conv.id
  const result = await conversationStore.deleteConversation(conv.id)
  if (!result?.ok) {
    // 删除失败时给个提示
    await uiStore.confirm({
      title: '删除失败',
      message: result?.error || '未知错误，请稍后重试。',
      variant: 'warning',
      confirmText: '知道了',
      cancelText: '关闭',
    })
    return
  }
  if (wasCurrent) {
    router.push('/home')
  }
}

// 点击外部关闭菜单
function onWindowClick(event: MouseEvent) {
  if (!openMenuId.value) return
  const target = event.target as HTMLElement | null
  if (!target) return
  if (target.closest('.conversation-menu') || target.closest('.conversation-more')) {
    return
  }
  closeMenu()
}

window.addEventListener('click', onWindowClick)
onBeforeUnmount(() => {
  window.removeEventListener('click', onWindowClick)
})
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <button class="brand-logo" @click="goHome" title="返回首页">
        <img :src="appIconUrl" alt="TieX logo" />
      </button>
      <div class="brand-copy" v-if="!uiStore.sidebarCollapsed">
        <div class="brand-title">TieX</div>
        <div class="brand-subtitle">Local Agent Workspace</div>
      </div>
      <button class="collapse-btn" @click="uiStore.toggleSidebar" :title="uiStore.sidebarCollapsed ? '展开' : '收起'">
        <PanelLeftClose v-if="!uiStore.sidebarCollapsed" :size="18" />
        <PanelLeftOpen v-else :size="18" />
      </button>
    </div>

    <div class="sidebar-main">
      <button class="nav-item primary" @click="createNewConversation">
        <Plus :size="18" />
        <span v-if="!uiStore.sidebarCollapsed">新对话</span>
      </button>

      <template v-if="!uiStore.sidebarCollapsed">
        <div class="nav-list">
          <button class="sub-nav-item">
            <Search :size="17" />
            <span>搜索</span>
          </button>
          <button class="sub-nav-item">
            <Library :size="17" />
            <span>工作区</span>
          </button>
          <button class="sub-nav-item">
            <Clock3 :size="17" />
            <span>最近</span>
          </button>
        </div>

        <div class="workspace-section">
          <WorkspaceSelector />
        </div>
      </template>

      <button class="workspace-pill collapsed-pill" v-else @click="uiStore.toggleSidebar">
        <FolderOpen :size="16" />
      </button>

      <template v-if="!uiStore.sidebarCollapsed && workspaceList.length > 0">
        <div class="section-title">项目</div>
        <div
          v-for="ws in workspaceList"
          :key="ws.id"
          class="project-row"
        >
          <FolderOpen :size="16" />
          <span>{{ ws.name }}</span>
        </div>
      </template>

      <div class="section-title" v-if="!uiStore.sidebarCollapsed">最近</div>

      <template v-if="!uiStore.sidebarCollapsed">
        <div
          v-for="conv in recentConversations"
          :key="conv.id"
          class="conversation"
          :class="{
            active: conversationStore.currentConversationId === conv.id,
            'menu-open': openMenuId === conv.id,
            renaming: renamingId === conv.id,
          }"
          @click="openConversation(conv.id)"
        >
          <div class="conversation-dot"></div>
          <div class="conversation-meta">
            <template v-if="renamingId === conv.id">
              <div class="conversation-rename">
                <input
                  ref="renameInputRef"
                  v-model="renameValue"
                  class="conversation-rename-input"
                  type="text"
                  maxlength="80"
                  :disabled="savingRenameId === conv.id"
                  @click.stop
                  @keydown.enter.stop.prevent="commitRename"
                  @keydown.esc.stop="cancelRename"
                />
                <div class="conversation-rename-actions">
                  <button
                    class="rename-btn"
                    :class="{ primary: true, loading: savingRenameId === conv.id }"
                    :disabled="savingRenameId === conv.id"
                    title="保存（Enter）"
                    @click.stop="commitRename"
                  >
                    <Check :size="14" />
                  </button>
                  <button
                    class="rename-btn"
                    :disabled="savingRenameId === conv.id"
                    title="取消（Esc）"
                    @click.stop="cancelRename"
                  >
                    <X :size="14" />
                  </button>
                </div>
                <div v-if="renameError" class="conversation-rename-error">{{ renameError }}</div>
              </div>
            </template>
            <template v-else>
              <div class="conversation-title">{{ conv.title }}</div>
              <div class="conversation-time">{{ formatTime(conv.updated_at) }}</div>
            </template>
          </div>

          <button
            v-if="renamingId !== conv.id"
            class="conversation-more"
            title="更多"
            @click="toggleMenu($event, conv.id)"
          >
            <MoreHorizontal :size="16" />
          </button>

          <div v-if="openMenuId === conv.id" class="conversation-menu" @click.stop>
            <button class="menu-item" @click="startRename($event, conv)">
              <Pencil :size="14" />
              <span>重命名</span>
            </button>
            <button class="menu-item danger" @click="confirmDelete($event, conv)">
              <Trash2 :size="14" />
              <span>删除</span>
            </button>
          </div>
        </div>
      </template>
    </div>

    <div class="sidebar-footer">
      <button class="settings-row" @click="goSettings">
        <Settings :size="18" />
        <span v-if="!uiStore.sidebarCollapsed">设置</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  border-right: 1px solid var(--sidebar-border);
  background: var(--sidebar-bg);
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  transition: all 0.25s ease;
  color: var(--sidebar-text);
}

.brand {
  height: 74px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  border-bottom: 1px solid var(--sidebar-divider);
  -webkit-app-region: drag;
}

.brand-logo {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: var(--sidebar-pill-bg);
  flex-shrink: 0;
  overflow: hidden;
  -webkit-app-region: no-drag;
}

.brand-logo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.brand-copy {
  min-width: 0;
}

.brand-title {
  font-size: 16px;
  font-weight: 700;
  white-space: nowrap;
  color: var(--sidebar-text);
}

.brand-subtitle {
  margin-top: 4px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--sidebar-text-muted);
  font-weight: 600;
  opacity: 0.85;
}

.collapse-btn {
  margin-left: auto;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  color: var(--sidebar-text-soft);
  -webkit-app-region: no-drag;
  display: grid;
  place-items: center;
}

.collapse-btn:hover {
  background: var(--sidebar-item-hover);
  color: var(--sidebar-text);
}

.sidebar-main {
  padding: 12px 10px 16px;
  overflow: auto;
  flex: 1;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 48px;
  padding: 0 14px;
  border-radius: 14px;
  color: var(--sidebar-text);
  text-align: left;
  font-weight: 600;
}

.nav-item.primary {
  background: var(--sidebar-item-active);
}

.nav-item.primary:hover {
  background: var(--sidebar-item-hover);
}

.nav-list {
  display: grid;
  gap: 6px;
  margin: 14px 0 10px;
}

.sub-nav-item,
.project-row,
.settings-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 42px;
  padding: 0 14px;
  border-radius: 12px;
  color: var(--sidebar-text-soft);
  text-align: left;
  font-weight: 600;
}

.sub-nav-item:hover,
.project-row:hover,
.settings-row:hover {
  background: var(--sidebar-item-hover);
  color: var(--sidebar-text);
}

.workspace-section {
  margin-top: 10px;
}

.workspace-pill {
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 46px;
  margin-top: 8px;
  border-radius: 14px;
  color: var(--sidebar-text);
  font-weight: 600;
  border: 1px solid var(--sidebar-border);
}

.workspace-pill:hover {
  background: var(--sidebar-item-hover);
}

.section-title {
  padding: 16px 14px 8px;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--sidebar-text-muted);
  font-weight: 700;
}

.conversation {
  position: relative;
  display: flex;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 14px;
  align-items: flex-start;
  cursor: pointer;
}

.conversation:hover,
.conversation.active,
.conversation.menu-open {
  background: var(--sidebar-item-active);
}

.conversation-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 7px;
  background: var(--info);
  flex: 0 0 auto;
}

.conversation-meta {
  min-width: 0;
  flex: 1;
}

.conversation-title {
  font-size: 14px;
  line-height: 1.4;
  color: var(--sidebar-text);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conversation-time {
  margin-top: 3px;
  font-size: 11px;
  color: var(--sidebar-text-muted);
  font-weight: 500;
}

.conversation-rename {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.conversation-rename-input {
  width: 100%;
  font-size: 14px;
  font-weight: 600;
  color: var(--sidebar-text);
  background: var(--panel);
  border: 1.5px solid var(--accent);
  border-radius: 8px;
  padding: 6px 8px;
  outline: none;
  font-family: inherit;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
}

.conversation-rename-input:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.conversation-rename-actions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  align-items: center;
}

.rename-btn {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  background: var(--sidebar-pill-bg);
  border: 1px solid var(--sidebar-border);
  cursor: pointer;
  color: var(--sidebar-text-soft);
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.rename-btn:hover:not(:disabled) {
  background: var(--sidebar-item-hover);
  color: var(--sidebar-text);
}

.rename-btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent, #fff);
}

.rename-btn.primary:hover:not(:disabled) {
  filter: brightness(1.08);
}

.rename-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.rename-btn.loading {
  position: relative;
  color: transparent;
}

.rename-btn.loading::after {
  content: '';
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid currentColor;
  border-top-color: transparent;
  color: var(--on-accent, #fff);
  animation: rename-spin 0.7s linear infinite;
}

@keyframes rename-spin {
  to {
    transform: rotate(360deg);
  }
}

.conversation-rename-error {
  margin-top: 6px;
  font-size: 11px;
  color: var(--danger);
  font-weight: 500;
}

.conversation-more {
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--sidebar-text-muted);
  opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease, color 0.15s ease;
  margin-top: 2px;
}

.conversation:hover .conversation-more,
.conversation.active .conversation-more,
.conversation.menu-open .conversation-more {
  opacity: 1;
}

.conversation-more:hover {
  background: var(--sidebar-item-hover);
  color: var(--sidebar-text);
}

.conversation-menu {
  position: absolute;
  top: 38px;
  right: 10px;
  z-index: 20;
  min-width: 140px;
  padding: 6px;
  border-radius: 12px;
  background: var(--panel);
  border: 1px solid var(--sidebar-border);
  box-shadow: 0 12px 32px -8px rgba(0, 0, 0, 0.28);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  background: transparent;
  border: none;
  color: var(--sidebar-text);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
}

.menu-item:hover {
  background: var(--sidebar-item-hover);
}

.menu-item.danger {
  color: var(--danger);
}

.menu-item.danger:hover {
  background: color-mix(in srgb, var(--danger) 12%, transparent);
}

.sidebar-footer {
  padding: 10px;
  border-top: 1px solid var(--sidebar-divider);
}
</style>

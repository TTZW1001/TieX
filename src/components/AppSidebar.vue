<script setup lang="ts">
import { computed, ref, onBeforeUnmount, nextTick, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUiStore } from '@/stores/ui.store'
import { useConversationStore } from '@/stores/conversation.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { useSettingsStore } from '@/stores/settings.store'
import type { ConversationInfo } from '@/types/global'
import {
  ArrowLeft,
  Bot,
  Database,
  FolderCog,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  FolderOpen,
  KeyRound,
  MemoryStick,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  Info,
  Check,
  X,
  ChevronDown,
  Users,
} from 'lucide-vue-next'

const appIconUrl = new URL('../../icon.png', import.meta.url).href
const router = useRouter()
const route = useRoute()
const uiStore = useUiStore()
const conversationStore = useConversationStore()
const workspaceStore = useWorkspaceStore()
const settingsStore = useSettingsStore()

const searchQuery = ref('')
const collapsedGroups = ref<Record<string, boolean>>({})
const searchInputRef = ref<HTMLInputElement | null>(null)

const groupedConversations = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  const workspaceMap = new Map(workspaceStore.workspaces.map((workspace) => [workspace.id, workspace]))
  const groups = new Map<string, {
    id: string
    name: string
    path: string
    isUnassigned: boolean
    conversations: ConversationInfo[]
  }>()

  for (const conversation of conversationStore.conversations) {
    const workspace = conversation.workspace_id ? workspaceMap.get(conversation.workspace_id) : null
    const groupId = workspace?.id ?? '__unassigned__'

    if (!groups.has(groupId)) {
      groups.set(groupId, {
        id: groupId,
        name: workspace?.name ?? '未绑定工作区',
        path: workspace?.rootPath ?? '普通对话',
        isUnassigned: !workspace,
        conversations: [],
      })
    }

    groups.get(groupId)!.conversations.push(conversation)
  }

  return Array.from(groups.values())
    .map((group) => {
      const matchesGroup = !query ||
        group.name.toLowerCase().includes(query) ||
        group.path.toLowerCase().includes(query)

      const filteredConversations = group.conversations.filter((conversation) => {
        return !query || matchesGroup || conversation.title.toLowerCase().includes(query)
      })

      return {
        ...group,
        conversations: filteredConversations,
      }
    })
    .filter((group) => group.conversations.length > 0)
})

const hasSearchResults = computed(() => groupedConversations.value.length > 0)
const displayUserName = computed(() => settingsStore.userDisplayName.trim() || 'User')
const displayUserInitial = computed(() => displayUserName.value.slice(0, 1).toUpperCase())
const activeConversationId = computed(() => conversationStore.currentConversationId)
const isSettingsRoute = computed(() => route.name === 'settings')
const activeSettingsSection = computed(() => String(route.params.section ?? 'provider'))

const settingsSections = [
  { id: 'provider', label: '模型服务', icon: Bot },
  { id: 'permissions', label: '任务与权限', icon: KeyRound },
  { id: 'agents', label: '多 Agent', icon: Users },
  { id: 'memory', label: '记忆偏好', icon: MemoryStick },
  { id: 'data', label: '本地数据', icon: FolderCog },
  { id: 'stats', label: '数据统计', icon: Database },
] as const

function isGroupCollapsed(groupId: string): boolean {
  return collapsedGroups.value[groupId] ?? false
}

function toggleGroup(groupId: string): void {
  collapsedGroups.value = {
    ...collapsedGroups.value,
    [groupId]: !isGroupCollapsed(groupId),
  }
}

// —— 会话列表的更多菜单状态 ——
const openMenuId = ref<string | null>(null)
const renamingId = ref<string | null>(null)
const renameValue = ref('')
const renameInputRef = ref<HTMLInputElement | null>(null)

function goHome() {
  uiStore.closeConversationDetail()
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
  uiStore.closeConversationDetail()
  conversationStore.setCurrentConversation(id)
  router.push(`/conversation/${id}`)
}

async function createNewConversation() {
  uiStore.closeConversationDetail()
  conversationStore.setCurrentConversation(null)
  if (router.currentRoute.value.path !== '/home') {
    await router.push('/home')
  }
}

async function openSearchFromCollapsed() {
  if (isSettingsRoute.value) return
  if (!uiStore.sidebarCollapsed) {
    searchInputRef.value?.focus()
    return
  }
  uiStore.toggleSidebar()
  await nextTick()
  searchInputRef.value?.focus()
}

function goSettings() {
  uiStore.closeConversationDetail()
  router.push('/settings')
}

async function returnFromSettings() {
  uiStore.closeConversationDetail()
  await router.push('/home')
}

function openSettingsSection(sectionId: string) {
  router.push({
    name: 'settings',
    params: { section: sectionId },
  })
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

function openConversationDetail(event: MouseEvent, conv: { id: string }) {
  event.stopPropagation()
  openMenuId.value = null
  uiStore.openConversationDetail(conv.id)
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

onMounted(() => {
  workspaceStore.loadWorkspaces()
  conversationStore.loadConversations()
})
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-header" :class="{ collapsed: uiStore.sidebarCollapsed }">
      <div class="brand-shell" :class="{ hidden: uiStore.sidebarCollapsed }" :aria-hidden="uiStore.sidebarCollapsed">
        <button class="brand-logo" @click="goHome" title="返回首页">
          <img :src="appIconUrl" alt="TieX logo" />
        </button>
        <div class="brand-copy">
          <div class="brand-title">TieX</div>
        </div>
      </div>
      <button class="collapse-btn" @click="uiStore.toggleSidebar" :title="uiStore.sidebarCollapsed ? '展开侧栏' : '收起侧栏'">
        <PanelLeftClose v-if="!uiStore.sidebarCollapsed" :size="17" />
        <PanelLeftOpen v-else :size="17" />
      </button>
    </div>

    <div class="sidebar-actions">
      <button
        v-if="!isSettingsRoute"
        class="nav-row nav-row-primary"
        :class="{ collapsed: uiStore.sidebarCollapsed }"
        @click="createNewConversation"
        :title="uiStore.sidebarCollapsed ? '新对话' : undefined"
      >
        <span class="nav-icon nav-icon-plus">
          <Plus :size="12" />
        </span>
        <span class="nav-label" :class="{ hidden: uiStore.sidebarCollapsed }">新对话</span>
      </button>

      <button
        v-else
        class="nav-row"
        :class="{ collapsed: uiStore.sidebarCollapsed }"
        @click="returnFromSettings"
        :title="uiStore.sidebarCollapsed ? '返回应用' : undefined"
      >
        <span class="nav-icon">
          <ArrowLeft :size="15" />
        </span>
        <span class="nav-label" :class="{ hidden: uiStore.sidebarCollapsed }">返回应用</span>
      </button>

      <div v-if="!isSettingsRoute" class="search-slot" :class="{ collapsed: uiStore.sidebarCollapsed }">
        <button
          class="nav-row nav-row-icon-only search-collapsed-btn"
          :class="{ active: uiStore.sidebarCollapsed }"
          title="搜索"
          @click="openSearchFromCollapsed"
        >
          <span class="nav-icon">
            <Search :size="15" />
          </span>
        </button>

        <div class="search-shell" :class="{ hidden: uiStore.sidebarCollapsed }">
          <Search :size="15" class="search-icon" />
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            class="search-input"
            type="text"
            placeholder="搜索"
            aria-label="搜索"
            :tabindex="uiStore.sidebarCollapsed ? -1 : 0"
          />
        </div>
      </div>
    </div>

    <div class="sidebar-main" :class="{ collapsed: uiStore.sidebarCollapsed }">
      <div
        class="sidebar-main-inner"
        :class="{ hidden: uiStore.sidebarCollapsed && !isSettingsRoute }"
        :aria-hidden="uiStore.sidebarCollapsed && !isSettingsRoute"
      >
        <div v-if="isSettingsRoute" class="settings-group-list" :class="{ collapsed: uiStore.sidebarCollapsed }">
          <div class="settings-group-title" :class="{ hidden: uiStore.sidebarCollapsed }">设置</div>
          <button
            v-for="section in settingsSections"
            v-show="section.id !== 'stats' || settingsStore.statsOverview"
            :key="section.id"
            class="settings-nav-item"
            :class="{ active: activeSettingsSection === section.id, collapsed: uiStore.sidebarCollapsed }"
            @click="openSettingsSection(section.id)"
            :title="uiStore.sidebarCollapsed ? section.label : undefined"
          >
            <span class="nav-icon">
              <component :is="section.icon" :size="15" />
            </span>
            <span class="nav-label" :class="{ hidden: uiStore.sidebarCollapsed }">{{ section.label }}</span>
          </button>
        </div>

        <div v-else-if="groupedConversations.length > 0" class="group-list">
          <section v-for="group in groupedConversations" :key="group.id" class="workspace-group">
            <button class="workspace-group-head" @click="toggleGroup(group.id)">
              <div class="workspace-group-copy">
                <span class="workspace-group-title">
                  <FolderOpen :size="14" />
                  <span>{{ group.name }}</span>
                </span>
                <div class="workspace-group-path">{{ group.path }}</div>
              </div>
              <ChevronDown :size="14" class="workspace-group-chevron" :class="{ collapsed: isGroupCollapsed(group.id) }" />
            </button>

            <div v-show="!isGroupCollapsed(group.id)" class="workspace-group-body">
              <div
                v-for="conv in group.conversations"
                :key="conv.id"
                class="conversation"
                :class="{
                  active: activeConversationId === conv.id,
                  'menu-open': openMenuId === conv.id,
                  renaming: renamingId === conv.id,
                }"
                @click="openConversation(conv.id)"
              >
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
                        class="rename-btn rename-btn-primary"
                        :class="{ loading: savingRenameId === conv.id }"
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
                  <div class="conversation-title-row">
                    <span class="conversation-title">{{ conv.title }}</span>
                    <span v-if="conv.parent_conversation_id" class="branch-badge">分支</span>
                  </div>

                  <button class="conversation-more" title="更多" @click="toggleMenu($event, conv.id)">
                    <MoreHorizontal :size="15" />
                  </button>

                  <div v-if="openMenuId === conv.id" class="conversation-menu" @click.stop>
                    <button class="menu-item" @click="openConversationDetail($event, conv)">
                      <Info :size="14" />
                      <span>详细信息</span>
                    </button>
                    <button class="menu-item" @click="startRename($event, conv)">
                      <Pencil :size="14" />
                      <span>重命名</span>
                    </button>
                    <button class="menu-item danger" @click="confirmDelete($event, conv)">
                      <Trash2 :size="14" />
                      <span>删除</span>
                    </button>
                  </div>
                </template>
              </div>
            </div>
          </section>
        </div>

        <div v-else-if="searchQuery && !hasSearchResults" class="sidebar-empty">
          没有匹配的工作目录或会话
        </div>
        <div v-else class="sidebar-empty">
          还没有历史会话，先开始一个新对话吧。
        </div>
      </div>
    </div>

    <div class="sidebar-footer">
      <button class="user-row" @click="goSettings" :title="uiStore.sidebarCollapsed ? '设置' : undefined">
        <div class="user-avatar">{{ displayUserInitial }}</div>
        <div class="user-copy" :class="{ hidden: uiStore.sidebarCollapsed }">
          <span class="user-name">{{ displayUserName }}</span>
          <span class="user-plan">本地工作台</span>
        </div>
        <span class="user-settings" :class="{ hidden: uiStore.sidebarCollapsed }">
          <Settings :size="15" />
        </span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  position: relative;
  border-right: 1px solid var(--sidebar-border);
  background: var(--sidebar-bg);
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  transition: background-color 180ms ease, border-color 180ms ease;
  color: var(--sidebar-text);
}

.sidebar-header {
  height: var(--topbar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 8px;
  border-bottom: 1px solid var(--sidebar-divider);
  -webkit-app-region: drag;
}

.sidebar-header.collapsed {
  justify-content: flex-end;
}

.brand-shell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  overflow: hidden;
  transition:
    width var(--duration-base) var(--ease-out),
    opacity var(--duration-fast) ease,
    transform var(--duration-base) var(--ease-out);
}

.brand-shell.hidden {
  width: 0;
  opacity: 0;
  transform: translateX(-6px);
  pointer-events: none;
}

.brand-logo {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: var(--sidebar-logo-bg);
  border: 1px solid var(--sidebar-logo-border);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
  overflow: hidden;
  -webkit-app-region: no-drag;
}

.brand-logo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.brand-title {
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  color: var(--sidebar-text);
}

.brand-copy {
  min-width: 0;
  white-space: nowrap;
}

.collapse-btn {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  color: var(--sidebar-text-soft);
  -webkit-app-region: no-drag;
  display: grid;
  place-items: center;
  transition: background-color 120ms ease, color 120ms ease;
}

.collapse-btn:hover {
  background: var(--sidebar-item-hover);
  color: var(--sidebar-text);
}

.sidebar-actions {
  padding: 8px;
  display: grid;
  gap: 6px;
  overflow: hidden;
}

.nav-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 10px;
  color: var(--sidebar-text);
  text-align: left;
  font-size: 14px;
  overflow: hidden;
  transition:
    background-color 90ms ease,
    color 90ms ease,
    padding var(--duration-base) var(--ease-out),
    min-height var(--duration-base) var(--ease-out);
}

.nav-row.collapsed {
  gap: 0;
  justify-content: center;
  padding: 0;
}

.nav-row:hover {
  background: var(--sidebar-item-hover);
}

.nav-row-primary {
  background: var(--sidebar-item-active);
}

.nav-row-icon-only {
  justify-content: center;
  padding: 0;
  background: transparent;
}

.nav-label {
  white-space: nowrap;
  transition:
    opacity var(--duration-fast) ease,
    transform var(--duration-base) var(--ease-out),
    width var(--duration-base) var(--ease-out);
}

.nav-label.hidden {
  width: 0;
  opacity: 0;
  transform: translateX(-6px);
  pointer-events: none;
}

.nav-icon {
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
}

.nav-icon-plus {
  border-radius: 999px;
  background: color-mix(in srgb, var(--sidebar-text) 10%, transparent);
}

.search-slot {
  position: relative;
  min-height: 36px;
}

.search-slot.collapsed {
  min-height: 36px;
}

.search-collapsed-btn {
  position: absolute;
  inset: 0;
  opacity: 0;
  transform: scale(0.92);
  pointer-events: none;
  transition:
    opacity var(--duration-fast) ease,
    transform var(--duration-base) var(--ease-out);
}

.search-collapsed-btn.active {
  opacity: 1;
  transform: scale(1);
  pointer-events: auto;
}

.search-shell {
  position: relative;
  display: flex;
  align-items: center;
  border: 1px solid var(--sidebar-border);
  border-radius: 10px;
  background: transparent;
  min-height: 36px;
  transition:
    opacity var(--duration-fast) ease,
    transform var(--duration-base) var(--ease-out),
    border-color var(--duration-fast) ease;
}

.search-shell.hidden {
  opacity: 0;
  transform: translateY(-4px);
  pointer-events: none;
}

.search-shell:focus-within {
  background: color-mix(in srgb, var(--sidebar-item-hover) 50%, transparent);
}

.search-icon {
  margin-left: 12px;
  color: var(--sidebar-text-muted);
}

.search-input {
  width: 100%;
  min-height: 34px;
  padding: 0 12px 0 8px;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--sidebar-text);
  font-size: 13px;
}

.search-input::placeholder {
  color: var(--sidebar-text-muted);
}

.sidebar-main {
  padding: 4px 8px 8px;
  overflow-y: auto;
  overflow-x: hidden;
  flex: 1;
  min-height: 0;
}

.sidebar-main.collapsed {
  overflow-y: auto;
  overflow-x: hidden;
}

.sidebar-main-inner {
  transition:
    opacity var(--duration-fast) ease,
    transform var(--duration-base) var(--ease-out);
}

.sidebar-main-inner.hidden {
  opacity: 0;
  transform: translateX(-8px);
  pointer-events: none;
}

.settings-group-list {
  display: grid;
  gap: 6px;
}

.settings-group-list.collapsed {
  gap: 8px;
}

.settings-group-title {
  padding: 6px 10px 8px;
  color: var(--sidebar-text-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.settings-group-title.hidden {
  display: none;
}

.settings-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 36px;
  padding: 0 10px;
  border-radius: 10px;
  color: var(--sidebar-text-soft);
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  overflow: hidden;
  transition: background-color 120ms ease, color 120ms ease;
}

.settings-nav-item.collapsed {
  gap: 0;
  justify-content: center;
  min-height: 38px;
  padding: 0;
  border-radius: 12px;
}

.settings-nav-item:hover {
  background: var(--sidebar-item-hover);
  color: var(--sidebar-text);
}

.settings-nav-item.active {
  background: color-mix(in srgb, var(--sidebar-text) 7%, transparent);
  color: var(--sidebar-text);
}

.group-list {
  display: grid;
  gap: 10px;
}

.workspace-group {
  display: grid;
  gap: 2px;
}

.workspace-group-head {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  color: var(--sidebar-text-muted);
  border-radius: 12px;
  border: 1px solid var(--sidebar-border);
  background: color-mix(in srgb, var(--sidebar-surface) 90%, transparent);
  transition: background-color 120ms ease, color 120ms ease;
}

.workspace-group-head:hover {
  background: var(--sidebar-item-hover);
  color: var(--sidebar-text);
}

.workspace-group-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  flex: 1;
}

.workspace-group-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.workspace-group-chevron {
  transition: transform 180ms ease;
}

.workspace-group-chevron.collapsed {
  transform: rotate(-90deg);
}

.workspace-group-path {
  color: var(--sidebar-text-muted);
  font-size: 11px;
  line-height: 1.4;
  word-break: break-all;
  text-transform: none;
  letter-spacing: 0;
  padding-left: 22px;
}

.workspace-group-body {
  display: grid;
  gap: 1px;
  padding-top: 4px;
}

.conversation {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 32px;
  padding: 0 10px 0 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: background-color 90ms ease, color 90ms ease;
}

.conversation:hover,
.conversation.active,
.conversation.menu-open {
  background: var(--sidebar-item-active);
}

.conversation-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  width: 100%;
}

.conversation-title {
  font-size: 13px;
  line-height: 1.3;
  color: var(--sidebar-text);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.branch-badge {
  border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--sidebar-border));
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  color: color-mix(in srgb, var(--accent) 88%, var(--sidebar-text));
  border-radius: 999px;
  padding: 2px 6px;
  font-size: 9px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  flex: 0 0 auto;
}

.conversation-rename {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.conversation-rename-input {
  width: 100%;
  font-size: 13px;
  font-weight: 500;
  color: var(--sidebar-text);
  background: var(--sidebar-surface);
  border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--sidebar-border));
  border-radius: 8px;
  padding: 6px 8px;
  outline: none;
  font-family: inherit;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 10%, transparent);
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
  background: color-mix(in srgb, var(--sidebar-surface) 84%, transparent);
  border: 1px solid var(--sidebar-border);
  cursor: pointer;
  color: var(--sidebar-text-soft);
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.rename-btn:hover:not(:disabled) {
  background: var(--sidebar-item-hover);
  color: var(--sidebar-text);
}

.rename-btn-primary {
  background: var(--sidebar-text);
  border-color: var(--sidebar-text);
  color: var(--on-accent, #fff);
}

.rename-btn-primary:hover:not(:disabled) {
  filter: brightness(1.04);
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
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--sidebar-text-muted);
  opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease, color 0.15s ease;
  margin-left: 6px;
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
  top: 28px;
  right: 0;
  z-index: 20;
  min-width: 140px;
  padding: 6px;
  border-radius: 10px;
  background: var(--sidebar-surface);
  border: 1px solid var(--sidebar-border);
  box-shadow: 0 18px 32px -16px rgba(0, 0, 0, 0.28);
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
  padding: 8px;
  border-top: 1px solid var(--sidebar-divider);
  overflow: hidden;
}

.user-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 52px;
  padding: 8px;
  border-radius: 12px;
  overflow: hidden;
  transition:
    background-color 120ms ease,
    padding var(--duration-base) var(--ease-out);
}

.user-row:hover {
  background: var(--sidebar-item-hover);
}

.user-avatar {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  background: var(--sidebar-text);
  color: var(--sidebar-bg-solid);
  display: grid;
  place-items: center;
  font-size: 13px;
  font-weight: 700;
  flex: 0 0 auto;
}

.user-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  flex: 1;
  white-space: nowrap;
  transition:
    opacity var(--duration-fast) ease,
    transform var(--duration-base) var(--ease-out),
    width var(--duration-base) var(--ease-out);
}

.user-copy.hidden {
  width: 0;
  opacity: 0;
  transform: translateX(-6px);
  pointer-events: none;
}

.user-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--sidebar-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-plan {
  font-size: 11px;
  color: var(--sidebar-text-muted);
}

.user-settings {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: var(--sidebar-text-muted);
  flex: 0 0 auto;
  transition:
    opacity var(--duration-fast) ease,
    transform var(--duration-base) var(--ease-out);
}

.user-settings.hidden {
  opacity: 0;
  transform: translateX(6px);
  pointer-events: none;
}

.user-row:hover .user-settings {
  background: color-mix(in srgb, var(--sidebar-item-hover) 80%, transparent);
  color: var(--sidebar-text);
}

.sidebar-empty {
  padding: 18px 10px;
  color: var(--sidebar-text-muted);
  font-size: 13px;
  line-height: 1.6;
}
</style>

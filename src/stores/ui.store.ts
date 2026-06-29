import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface PermissionRequestData {
  requestId: string
  taskId: string
  toolName: string
  title: string
  reason?: string
  target?: string
  impactSummary?: string
  riskLevel?: string
}

export interface ConfirmRequestData {
  title: string
  message?: string
  detail?: string
  variant?: 'info' | 'warning' | 'danger'
  confirmText?: string
  cancelText?: string
}

type ConfirmResolver = (ok: boolean) => void
export type ComposerDraftSource = 'command_failure' | 'permission_rejection' | 'manual_plan' | 'generic'

export const useUiStore = defineStore('ui', () => {
  const sidebarCollapsed = ref(false)
  const drawerOpen = ref(false)
  const permissionDialogOpen = ref(false)
  const conversationDetailOpen = ref(false)
  const conversationDetailId = ref<string | null>(null)
  const composerDraft = ref('')
  const composerDraftSource = ref<ComposerDraftSource | null>(null)
  const activeDrawerTab = ref<'steps' | 'context' | 'files' | 'logs' | 'changes' | 'permissions' | 'artifacts' | 'workspace'>('steps')
  const currentPermissionRequest = ref<PermissionRequestData | null>(null)
  const currentConfirmRequest = ref<ConfirmRequestData | null>(null)
  let confirmResolver: ConfirmResolver | null = null

  async function initSidebarState() {
    if (!window.tiex?.settings) return
    try {
      const value = await window.tiex.settings.get('sidebar_collapsed')
      if (value !== null) {
        sidebarCollapsed.value = value === 'true'
      }
    } catch (err) {
      console.error('Failed to load sidebar state:', err)
    }
  }

  function toggleSidebar() {
    setSidebarCollapsed(!sidebarCollapsed.value)
  }

  function setSidebarCollapsed(collapsed: boolean, persist: boolean = true) {
    sidebarCollapsed.value = collapsed
    if (!persist || !window.tiex?.settings) return
    window.tiex.settings
      .update('sidebar_collapsed', collapsed ? 'true' : 'false')
      .catch((err) => {
        console.error('Failed to persist sidebar state:', err)
      })
  }

  function toggleDrawer() {
    drawerOpen.value = !drawerOpen.value
  }

  function openDrawer() {
    drawerOpen.value = true
  }

  function closeDrawer() {
    drawerOpen.value = false
  }

  function openPermissionDialog(data: PermissionRequestData) {
    currentPermissionRequest.value = data
    permissionDialogOpen.value = true
  }

  function closePermissionDialog() {
    permissionDialogOpen.value = false
    currentPermissionRequest.value = null
  }

  function openConversationDetail(conversationId: string) {
    conversationDetailId.value = conversationId
    conversationDetailOpen.value = true
  }

  function closeConversationDetail() {
    conversationDetailOpen.value = false
    conversationDetailId.value = null
  }

  function setComposerDraft(value: string, source: ComposerDraftSource = 'generic') {
    composerDraft.value = value
    composerDraftSource.value = source
  }

  function clearComposerDraft() {
    composerDraft.value = ''
    composerDraftSource.value = null
  }

  function setDrawerTab(tab: 'steps' | 'context' | 'files' | 'logs' | 'changes' | 'permissions' | 'artifacts' | 'workspace') {
    activeDrawerTab.value = tab
  }

  /**
   * 弹出通用确认弹窗，返回 Promise<boolean>
   */
  function confirm(data: ConfirmRequestData): Promise<boolean> {
    // 覆盖前如果已有未确认的弹窗，按取消处理
    if (confirmResolver) {
      const prev = confirmResolver
      confirmResolver = null
      prev(false)
    }
    currentConfirmRequest.value = data
    return new Promise<boolean>((resolve) => {
      confirmResolver = resolve
    })
  }

  function closeConfirmDialog(result: boolean) {
    if (confirmResolver) {
      const r = confirmResolver
      confirmResolver = null
      r(result)
    }
    currentConfirmRequest.value = null
  }

  return {
    sidebarCollapsed,
    drawerOpen,
    permissionDialogOpen,
    conversationDetailOpen,
    conversationDetailId,
    composerDraft,
    composerDraftSource,
    activeDrawerTab,
    currentPermissionRequest,
    currentConfirmRequest,
    initSidebarState,
    toggleSidebar,
    setSidebarCollapsed,
    toggleDrawer,
    openDrawer,
    closeDrawer,
    openPermissionDialog,
    closePermissionDialog,
    openConversationDetail,
    closeConversationDetail,
    setComposerDraft,
    clearComposerDraft,
    setDrawerTab,
    confirm,
    closeConfirmDialog,
  }
})

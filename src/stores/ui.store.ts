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

export const useUiStore = defineStore('ui', () => {
  const sidebarCollapsed = ref(false)
  const drawerOpen = ref(false)
  const permissionDialogOpen = ref(false)
  const composerDraft = ref('')
  const activeDrawerTab = ref<'steps' | 'files' | 'logs' | 'changes' | 'artifacts'>('steps')
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
    sidebarCollapsed.value = !sidebarCollapsed.value
    // 持久化侧边栏状态
    if (window.tiex?.settings) {
      window.tiex.settings
        .update('sidebar_collapsed', sidebarCollapsed.value ? 'true' : 'false')
        .catch((err) => {
          console.error('Failed to persist sidebar state:', err)
        })
    }
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

  function setComposerDraft(value: string) {
    composerDraft.value = value
  }

  function clearComposerDraft() {
    composerDraft.value = ''
  }

  function setDrawerTab(tab: 'steps' | 'files' | 'logs' | 'changes' | 'artifacts') {
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
    composerDraft,
    activeDrawerTab,
    currentPermissionRequest,
    currentConfirmRequest,
    initSidebarState,
    toggleSidebar,
    toggleDrawer,
    openDrawer,
    closeDrawer,
    openPermissionDialog,
    closePermissionDialog,
    setComposerDraft,
    clearComposerDraft,
    setDrawerTab,
    confirm,
    closeConfirmDialog,
  }
})

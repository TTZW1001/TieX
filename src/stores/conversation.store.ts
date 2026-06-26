import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ConversationInfo } from '@/types/global'
import { useWorkspaceStore } from './workspace.store'

export const useConversationStore = defineStore('conversation', () => {
  const conversations = ref<ConversationInfo[]>([])
  const currentConversationId = ref<string | null>(null)

  // currentWorkspace 引用 workspace.store，实际数据由 workspace.store 管理
  const workspaceStore = useWorkspaceStore()
  const currentWorkspace = computed(() => workspaceStore.currentWorkspace)

  async function loadConversations() {
    if (!window.tiex) return
    try {
      conversations.value = await window.tiex.conversation.getRecent(100)
    } catch (err) {
      console.error('Failed to load conversations:', err)
    }
  }

  async function createConversation(data?: Record<string, unknown>) {
    if (!window.tiex) return null
    try {
      const conv = await window.tiex.conversation.create(data)
      conversations.value.unshift(conv)
      return conv
    } catch (err) {
      console.error('Failed to create conversation:', err)
      return null
    }
  }

  async function deleteConversation(id: string): Promise<{ ok: boolean; error?: string }> {
    if (!window.tiex) return { ok: false, error: 'IPC not available' }
    try {
      const result = await window.tiex.conversation.delete(id)
      if (result?.ok) {
        conversations.value = conversations.value.filter((c) => c.id !== id)
        if (currentConversationId.value === id) {
          currentConversationId.value = null
        }
      } else {
        console.error('Failed to delete conversation:', result?.error)
      }
      return result
    } catch (err: any) {
      console.error('Failed to delete conversation:', err)
      return { ok: false, error: err?.message || String(err) }
    }
  }

  async function branchConversation(conversationId: string, messageId: string) {
    if (!window.tiex) return null
    try {
      const conv = await window.tiex.conversation.branchFromMessage(conversationId, messageId)
      conversations.value.unshift(conv)
      return conv
    } catch (err) {
      console.error('Failed to branch conversation:', err)
      return null
    }
  }

  async function updateConversationProvider(id: string, providerId: string | null): Promise<boolean> {
    if (!window.tiex) return false
    try {
      await window.tiex.conversation.updateProvider(id, providerId)
      const conv = conversations.value.find((item) => item.id === id)
      if (conv) {
        conv.provider_id = providerId
        conv.updated_at = new Date().toISOString()
      }
      return true
    } catch (err) {
      console.error('Failed to update conversation provider:', err)
      return false
    }
  }

  async function updateConversationPermissionMode(
    id: string,
    permissionMode: 'chat' | 'read' | 'execute' | 'command'
  ): Promise<boolean> {
    if (!window.tiex) return false
    try {
      await window.tiex.conversation.updatePermissionMode(id, permissionMode)
      const conv = conversations.value.find((item) => item.id === id)
      if (conv) {
        conv.permission_mode = permissionMode
        conv.updated_at = new Date().toISOString()
      }
      return true
    } catch (err) {
      console.error('Failed to update conversation permission mode:', err)
      return false
    }
  }

  function setCurrentConversation(id: string | null) {
    currentConversationId.value = id
  }

  /** 更新会话列表中的标题（自动标题后调用） */
  function updateConversationTitle(id: string, title: string) {
    const conv = conversations.value.find((c) => c.id === id)
    if (conv) {
      conv.title = title
    }
  }

  /**
   * 重命名会话：同步调用后端并更新本地缓存
   */
  async function renameConversation(id: string, newTitle: string): Promise<boolean> {
    if (!window.tiex) {
      console.warn('[renameConversation] window.tiex is not available')
      return false
    }
    const trimmed = newTitle.trim()
    if (!trimmed) {
      console.warn('[renameConversation] empty title')
      return false
    }
    try {
      console.log('[renameConversation] IPC call:', { id, trimmed })
      await window.tiex.conversation.updateTitle(id, trimmed)
      console.log('[renameConversation] IPC succeeded, updating local cache')
      // 整体替换数组里的对象引用，确保所有引用方（顶栏、列表）都刷新
      const idx = conversations.value.findIndex((c) => c.id === id)
      if (idx >= 0) {
        const updated = { ...conversations.value[idx], title: trimmed, updated_at: new Date().toISOString() }
        // 用新数组触发依赖更新
        conversations.value = [
          ...conversations.value.slice(0, idx),
          updated,
          ...conversations.value.slice(idx + 1),
        ]
      }
      return true
    } catch (err) {
      console.error('[renameConversation] IPC failed:', err)
      return false
    }
  }

  return {
    conversations,
    currentConversationId,
    currentWorkspace,
    loadConversations,
    createConversation,
    branchConversation,
    deleteConversation,
    updateConversationProvider,
    updateConversationPermissionMode,
    setCurrentConversation,
    updateConversationTitle,
    renameConversation,
  }
})

import { ipcMain } from 'electron'
import {
  IPC_CONVERSATION_CREATE,
  IPC_CONVERSATION_GET_RECENT,
  IPC_CONVERSATION_GET_BY_ID,
  IPC_CONVERSATION_UPDATE_TITLE,
  IPC_CONVERSATION_UPDATE_PROVIDER,
  IPC_CONVERSATION_UPDATE_WORKSPACE,
  IPC_CONVERSATION_UPDATE_PERMISSION_MODE,
  IPC_CONVERSATION_BRANCH_FROM_MESSAGE,
  IPC_CONVERSATION_DELETE,
} from '../../shared/ipc'
import { ConversationRepository } from '../database/repositories/conversation.repository'
import { ProviderRepository } from '../database/repositories/provider.repository'
import { SettingsRepository } from '../database/repositories/settings.repository'

const conversationRepo = new ConversationRepository()
const providerRepo = new ProviderRepository()
const settingsRepo = new SettingsRepository()

export function registerConversationIpc(): void {
  ipcMain.handle(IPC_CONVERSATION_CREATE, async (_event, data?: Record<string, unknown>) => {
    const payload = { ...(data ?? {}) }
    if (!payload.provider_id) {
      const defaultProvider = providerRepo.getDefault()
      if (defaultProvider) {
        payload.provider_id = defaultProvider.id
      }
    }
    if (!payload.permission_mode) {
      const hasWorkspace = typeof payload.workspace_id === 'string' && payload.workspace_id.trim().length > 0
      payload.permission_mode = hasWorkspace ? settingsRepo.get('default_permission_mode') ?? 'read' : 'chat'
    }
    return conversationRepo.create(payload)
  })

  ipcMain.handle(IPC_CONVERSATION_GET_RECENT, async (_event, limit?: number) => {
    const safeLimit = typeof limit === 'number' && limit > 0 ? limit : 20
    return conversationRepo.getRecent(safeLimit)
  })

  ipcMain.handle(IPC_CONVERSATION_GET_BY_ID, async (_event, id: string) => {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid conversation id')
    }
    return conversationRepo.getById(id)
  })

  ipcMain.handle(
    IPC_CONVERSATION_UPDATE_TITLE,
    async (_event, id: string, title: string) => {
      try {
        if (!id || typeof id !== 'string') {
          throw new Error('Invalid conversation id')
        }
        if (!title || typeof title !== 'string') {
          throw new Error('Invalid conversation title')
        }
        conversationRepo.updateTitle(id, title)
        console.log(`[conversation:updateTitle] ok id=${id} title="${title}"`)
      } catch (err) {
        console.error('[conversation:updateTitle] failed:', err)
        throw err
      }
    }
  )

  ipcMain.handle(
    IPC_CONVERSATION_UPDATE_PROVIDER,
    async (_event, id: string, providerId: string | null) => {
      if (!id || typeof id !== 'string') {
        throw new Error('Invalid conversation id')
      }
      conversationRepo.updateProvider(id, providerId)
    }
  )

  ipcMain.handle(
    IPC_CONVERSATION_UPDATE_WORKSPACE,
    async (_event, id: string, workspaceId: string | null) => {
      if (!id || typeof id !== 'string') {
        throw new Error('Invalid conversation id')
      }
      if (workspaceId !== null && (typeof workspaceId !== 'string' || !workspaceId.trim())) {
        throw new Error('Invalid workspace id')
      }
      conversationRepo.updateWorkspace(id, workspaceId)
    }
  )

  ipcMain.handle(
    IPC_CONVERSATION_UPDATE_PERMISSION_MODE,
    async (_event, id: string, permissionMode: string) => {
      if (!id || typeof id !== 'string') {
        throw new Error('Invalid conversation id')
      }
      if (!['chat', 'read', 'execute', 'command'].includes(permissionMode)) {
        throw new Error('Invalid permission mode')
      }
      conversationRepo.updatePermissionMode(id, permissionMode)
    }
  )

  ipcMain.handle(
    IPC_CONVERSATION_BRANCH_FROM_MESSAGE,
    async (_event, conversationId: string, messageId: string) => {
      if (!conversationId || !messageId) {
        throw new Error('conversationId 和 messageId 不能为空')
      }
      return conversationRepo.branchFromMessage(conversationId, messageId)
    }
  )

  ipcMain.handle(IPC_CONVERSATION_DELETE, async (_event, id: string) => {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid conversation id')
    }
    try {
      conversationRepo.deleteById(id)
      return { ok: true }
    } catch (err: any) {
      console.error('[conversation:delete] failed:', err)
      return {
        ok: false,
        error: err?.message || String(err),
      }
    }
  })
}

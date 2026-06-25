import { ipcMain } from 'electron'
import {
  IPC_CONVERSATION_CREATE,
  IPC_CONVERSATION_GET_RECENT,
  IPC_CONVERSATION_GET_BY_ID,
  IPC_CONVERSATION_UPDATE_TITLE,
  IPC_CONVERSATION_DELETE,
} from '../../shared/ipc'
import { ConversationRepository } from '../database/repositories/conversation.repository'
import { ProviderRepository } from '../database/repositories/provider.repository'

const conversationRepo = new ConversationRepository()
const providerRepo = new ProviderRepository()

export function registerConversationIpc(): void {
  ipcMain.handle(IPC_CONVERSATION_CREATE, async (_event, data?: Record<string, unknown>) => {
    const payload = { ...(data ?? {}) }
    if (!payload.provider_id) {
      const defaultProvider = providerRepo.getDefault()
      if (defaultProvider) {
        payload.provider_id = defaultProvider.id
      }
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

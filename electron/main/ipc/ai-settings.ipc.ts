import { ipcMain } from 'electron'
import {
  IPC_AI_SETTINGS_GET_DEFAULT,
  IPC_AI_SETTINGS_UPDATE_DEFAULT,
  IPC_AI_SETTINGS_GET_CONVERSATION,
  IPC_AI_SETTINGS_UPDATE_CONVERSATION,
  IPC_AI_SETTINGS_RESET_CONVERSATION,
  IPC_AI_SETTINGS_GET_EFFECTIVE,
} from '../../shared/ipc'
import type { AiConfig } from '../../shared/types'
import { AiSettingsService } from '../services/ai-settings.service'

const aiSettingsService = new AiSettingsService()

export function registerAiSettingsIpc(): void {
  ipcMain.handle(IPC_AI_SETTINGS_GET_DEFAULT, async () => {
    return aiSettingsService.getDefaultConfig()
  })

  ipcMain.handle(IPC_AI_SETTINGS_UPDATE_DEFAULT, async (_event, input: Partial<AiConfig>) => {
    if (!input || typeof input !== 'object') {
      throw new Error('Invalid AI config')
    }
    return aiSettingsService.updateDefaultConfig(input)
  })

  ipcMain.handle(IPC_AI_SETTINGS_GET_CONVERSATION, async (_event, conversationId: string) => {
    if (!conversationId || typeof conversationId !== 'string') {
      throw new Error('Invalid conversation id')
    }
    return aiSettingsService.getConversationSettings(conversationId)
  })

  ipcMain.handle(
    IPC_AI_SETTINGS_UPDATE_CONVERSATION,
    async (_event, conversationId: string, configPatch: Partial<AiConfig>, overrideMaskPatch?: Record<string, boolean>) => {
      if (!conversationId || typeof conversationId !== 'string') {
        throw new Error('Invalid conversation id')
      }
      if (!configPatch || typeof configPatch !== 'object') {
        throw new Error('Invalid AI config patch')
      }
      return aiSettingsService.updateConversationSettings(conversationId, configPatch, overrideMaskPatch as any)
    }
  )

  ipcMain.handle(IPC_AI_SETTINGS_RESET_CONVERSATION, async (_event, conversationId: string) => {
    if (!conversationId || typeof conversationId !== 'string') {
      throw new Error('Invalid conversation id')
    }
    aiSettingsService.resetConversationSettings(conversationId)
  })

  ipcMain.handle(IPC_AI_SETTINGS_GET_EFFECTIVE, async (_event, conversationId: string) => {
    if (!conversationId || typeof conversationId !== 'string') {
      throw new Error('Invalid conversation id')
    }
    return aiSettingsService.getEffectiveConfig(conversationId)
  })
}

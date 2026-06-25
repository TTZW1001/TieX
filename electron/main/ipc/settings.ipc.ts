import { ipcMain } from 'electron'
import {
  IPC_SETTINGS_GET,
  IPC_SETTINGS_GET_ALL,
  IPC_SETTINGS_UPDATE,
  IPC_SETTINGS_GET_DATA_DIRECTORY,
} from '../../shared/ipc'
import { SettingsService } from '../services/settings.service'

const settingsService = new SettingsService()

export function registerSettingsIpc(): void {
  ipcMain.handle(IPC_SETTINGS_GET, async (_event, key: string) => {
    if (!key || typeof key !== 'string') {
      throw new Error('Invalid settings key')
    }
    return settingsService.getSetting(key)
  })

  ipcMain.handle(IPC_SETTINGS_GET_ALL, async () => {
    return settingsService.getAllSettings()
  })

  ipcMain.handle(IPC_SETTINGS_GET_DATA_DIRECTORY, async () => {
    return settingsService.getDataDirectory()
  })

  ipcMain.handle(IPC_SETTINGS_UPDATE, async (_event, key: string, value: string) => {
    if (!key || typeof key !== 'string') {
      throw new Error('Invalid settings key')
    }
    if (typeof value !== 'string') {
      throw new Error('Invalid settings value')
    }
    await settingsService.updateSetting(key, value)
  })
}

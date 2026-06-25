import { app } from 'electron'
import { SettingsRepository } from '../database/repositories/settings.repository'

const settingsRepo = new SettingsRepository()

export class SettingsService {
  async getSetting(key: string): Promise<string | null> {
    return settingsRepo.get(key)
  }

  async updateSetting(key: string, value: string): Promise<void> {
    const existing = settingsRepo.get(key)
    const valueType = existing !== null ? undefined : 'string'
    if (valueType) {
      settingsRepo.set(key, value, valueType)
    } else {
      settingsRepo.set(key, value)
    }
  }

  async getAllSettings(): Promise<Record<string, string>> {
    const map = settingsRepo.getAll()
    const obj: Record<string, string> = {}
    map.forEach((value, key) => {
      obj[key] = value
    })
    return obj
  }

  async getDataDirectory(): Promise<string> {
    return app.getPath('userData')
  }

  async getTheme(): Promise<string> {
    return settingsRepo.get('theme') ?? 'system'
  }

  async setTheme(theme: string): Promise<void> {
    settingsRepo.set('theme', theme, 'string')
  }

  async getSidebarCollapsed(): Promise<boolean> {
    const value = settingsRepo.get('sidebar_collapsed')
    return value === 'true'
  }

  async setSidebarCollapsed(collapsed: boolean): Promise<void> {
    settingsRepo.set('sidebar_collapsed', collapsed ? 'true' : 'false', 'boolean')
  }
}

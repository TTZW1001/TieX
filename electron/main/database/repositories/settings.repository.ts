import { getDatabase } from '../database'
import type { AppSetting } from '../../../shared/types'

export class SettingsRepository {
  get(key: string): string | null {
    const db = getDatabase()
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row?.value ?? null
  }

  set(key: string, value: string, valueType: string = 'string'): void {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO app_settings (key, value, value_type, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, value_type = excluded.value_type, updated_at = excluded.updated_at`
    ).run(key, value, valueType, now)
  }

  getAll(): Map<string, string> {
    const db = getDatabase()
    const rows = db.prepare('SELECT key, value FROM app_settings').all() as AppSetting[]
    const map = new Map<string, string>()
    for (const row of rows) {
      map.set(row.key, row.value)
    }
    return map
  }

  getByPrefix(prefix: string): Map<string, string> {
    const db = getDatabase()
    const rows = db.prepare('SELECT key, value FROM app_settings WHERE key LIKE ?').all(
      `${prefix}%`
    ) as AppSetting[]
    const map = new Map<string, string>()
    for (const row of rows) {
      map.set(row.key, row.value)
    }
    return map
  }
}

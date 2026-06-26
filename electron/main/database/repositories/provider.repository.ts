import { getDatabase } from '../database'
import type { ModelProvider } from '../../../shared/types'
import { randomUUID } from 'crypto'

export class ProviderRepository {
  create(data: Partial<ModelProvider>): ModelProvider {
    const db = getDatabase()
    const id = data.id || randomUUID()
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO model_providers (
        id, name, provider_type, base_url, model_name, encrypted_api_key, temperature,
        max_tokens, timeout_ms, stream_enabled, is_default, is_enabled, is_deleted, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
    ).run(
      id,
      data.name ?? '新 Provider',
      data.provider_type ?? 'deepseek',
      data.base_url ?? 'https://api.deepseek.com',
      data.model_name ?? 'deepseek-v4-flash',
      data.temperature ?? null,
      data.max_tokens ?? null,
      data.timeout_ms ?? 60000,
      data.stream_enabled ?? 1,
      data.is_default ?? 0,
      data.is_enabled ?? 1,
      now,
      now,
    )
    return this.getById(id)!
  }

  listAll(): ModelProvider[] {
    const db = getDatabase()
    return db
      .prepare('SELECT * FROM model_providers WHERE is_deleted = 0 ORDER BY is_default DESC, updated_at DESC')
      .all() as ModelProvider[]
  }

  getDefault(): ModelProvider | null {
    const db = getDatabase()
    const row = db
      .prepare('SELECT * FROM model_providers WHERE is_default = 1 AND is_deleted = 0')
      .get() as ModelProvider | undefined
    return row ?? null
  }

  getById(id: string): ModelProvider | null {
    const db = getDatabase()
    const row = db
      .prepare('SELECT * FROM model_providers WHERE id = ? AND is_deleted = 0')
      .get(id) as ModelProvider | undefined
    return row ?? null
  }

  update(id: string, data: Partial<ModelProvider>): void {
    const db = getDatabase()
    const fields: string[] = []
    const values: any[] = []

    const allowedFields = [
      'name',
      'provider_type',
      'base_url',
      'model_name',
      'temperature',
      'max_tokens',
      'timeout_ms',
      'stream_enabled',
      'is_default',
      'is_enabled',
    ]

    for (const field of allowedFields) {
      if (field in data) {
        fields.push(`${field} = ?`)
        values.push((data as any)[field])
      }
    }

    if (fields.length === 0) return

    fields.push('updated_at = ?')
    values.push(new Date().toISOString())
    values.push(id)

    db.prepare(`UPDATE model_providers SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  }

  setDefault(id: string): void {
    const db = getDatabase()
    const now = new Date().toISOString()
    const tx = db.transaction((providerId: string) => {
      db.prepare('UPDATE model_providers SET is_default = 0, updated_at = ? WHERE is_deleted = 0').run(now)
      db.prepare('UPDATE model_providers SET is_default = 1, is_enabled = 1, is_deleted = 0, updated_at = ? WHERE id = ?').run(now, providerId)
    })
    tx(id)
  }

  setEncryptedApiKey(id: string, encryptedKey: Buffer): void {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare('UPDATE model_providers SET encrypted_api_key = ?, updated_at = ? WHERE id = ?').run(
      encryptedKey,
      now,
      id
    )
  }

  getEncryptedApiKey(id: string): Buffer | null {
    const db = getDatabase()
    const row = db
      .prepare('SELECT encrypted_api_key FROM model_providers WHERE id = ?')
      .get(id) as { encrypted_api_key: Buffer | null } | undefined
    return row?.encrypted_api_key ?? null
  }

  softDelete(id: string): void {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare(
      'UPDATE model_providers SET is_deleted = 1, is_default = 0, is_enabled = 0, updated_at = ? WHERE id = ?'
    ).run(now, id)
  }
}

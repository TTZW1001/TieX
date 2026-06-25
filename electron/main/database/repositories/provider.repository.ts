import { getDatabase } from '../database'
import type { ModelProvider } from '../../../shared/types'

export class ProviderRepository {
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
}

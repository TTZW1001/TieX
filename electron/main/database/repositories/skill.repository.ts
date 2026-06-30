import { randomUUID } from 'crypto'
import { getDatabase } from '../database'
import type { InstalledSkillEntity, SkillInfo } from '../../../shared/types'

export function toSkillInfo(row: InstalledSkillEntity): SkillInfo {
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name,
    description: row.description,
    source: row.source,
    version: row.version,
    path: row.path,
    enabled: row.enabled !== 0,
    installType: row.install_type,
    summary: row.summary,
    tokenEstimate: row.token_estimate,
    lastScannedAt: row.last_scanned_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class SkillRepository {
  listAll(): SkillInfo[] {
    const db = getDatabase()
    const rows = db
      .prepare('SELECT * FROM installed_skills ORDER BY enabled DESC, display_name COLLATE NOCASE ASC')
      .all() as InstalledSkillEntity[]
    return rows.map(toSkillInfo)
  }

  listEnabled(): SkillInfo[] {
    const db = getDatabase()
    const rows = db
      .prepare('SELECT * FROM installed_skills WHERE enabled = 1 ORDER BY display_name COLLATE NOCASE ASC')
      .all() as InstalledSkillEntity[]
    return rows.map(toSkillInfo)
  }

  getById(id: string): SkillInfo | null {
    const db = getDatabase()
    const row = db.prepare('SELECT * FROM installed_skills WHERE id = ?').get(id) as InstalledSkillEntity | undefined
    return row ? toSkillInfo(row) : null
  }

  getByName(name: string): SkillInfo | null {
    const db = getDatabase()
    const row = db.prepare('SELECT * FROM installed_skills WHERE name = ?').get(name) as InstalledSkillEntity | undefined
    return row ? toSkillInfo(row) : null
  }

  upsert(input: {
    name: string
    displayName: string
    description?: string | null
    source?: string | null
    version?: string | null
    path: string
    installType?: string
    contentHash?: string | null
    summary?: string | null
    tokenEstimate?: number | null
  }): SkillInfo {
    const db = getDatabase()
    const now = new Date().toISOString()
    const existing = this.getByName(input.name)
    const id = existing?.id ?? randomUUID()
    db.prepare(
      `INSERT INTO installed_skills (
        id, name, display_name, description, source, version, path, enabled, install_type,
        content_hash, summary, token_estimate, last_scanned_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT enabled FROM installed_skills WHERE name = ?), 1), ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        display_name = excluded.display_name,
        description = excluded.description,
        source = excluded.source,
        version = excluded.version,
        path = excluded.path,
        install_type = excluded.install_type,
        content_hash = excluded.content_hash,
        summary = excluded.summary,
        token_estimate = excluded.token_estimate,
        last_scanned_at = excluded.last_scanned_at,
        updated_at = excluded.updated_at`
    ).run(
      id,
      input.name,
      input.displayName,
      input.description ?? null,
      input.source ?? null,
      input.version ?? null,
      input.path,
      input.name,
      input.installType ?? existing?.installType ?? 'local',
      input.contentHash ?? null,
      input.summary ?? null,
      input.tokenEstimate ?? null,
      now,
      now,
      now
    )
    return this.getByName(input.name)!
  }

  setEnabled(id: string, enabled: boolean): void {
    const db = getDatabase()
    db.prepare('UPDATE installed_skills SET enabled = ?, updated_at = ? WHERE id = ?').run(
      enabled ? 1 : 0,
      new Date().toISOString(),
      id
    )
  }

  delete(id: string): void {
    const db = getDatabase()
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM message_skill_refs WHERE skill_id = ?').run(id)
      db.prepare('DELETE FROM installed_skills WHERE id = ?').run(id)
    })
    tx()
  }

  createMessageRefs(messageId: string, conversationId: string, skills: SkillInfo[]): void {
    if (skills.length === 0) return
    const db = getDatabase()
    const now = new Date().toISOString()
    const stmt = db.prepare(
      `INSERT INTO message_skill_refs (id, message_id, conversation_id, skill_id, skill_name, source, created_at)
       VALUES (?, ?, ?, ?, ?, 'explicit', ?)`
    )
    const tx = db.transaction(() => {
      for (const skill of skills) {
        stmt.run(randomUUID(), messageId, conversationId, skill.id, skill.name, now)
      }
    })
    tx()
  }

  getByMessageId(messageId: string): SkillInfo[] {
    const db = getDatabase()
    const rows = db
      .prepare(
        `SELECT s.*
         FROM message_skill_refs r
         JOIN installed_skills s ON s.id = r.skill_id
         WHERE r.message_id = ?
         ORDER BY r.created_at ASC`
      )
      .all(messageId) as InstalledSkillEntity[]
    return rows.map(toSkillInfo)
  }
}

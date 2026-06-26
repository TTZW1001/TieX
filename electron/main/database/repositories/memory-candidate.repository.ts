import { randomUUID } from 'crypto'
import { getDatabase } from '../database'
import type { MemoryCandidate } from '../../../shared/types'

export class MemoryCandidateRepository {
  create(data: Omit<MemoryCandidate, 'id' | 'created_at' | 'decided_at'>): MemoryCandidate | null {
    const db = getDatabase()
    const id = randomUUID()
    const now = new Date().toISOString()
    try {
      db.prepare(
        `INSERT INTO memory_candidates (
          id, scope, category, candidate_text, source_message_id, workspace_id, status, created_at, decided_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`
      ).run(
        id,
        data.scope,
        data.category,
        data.candidate_text,
        data.source_message_id ?? null,
        data.workspace_id ?? null,
        data.status,
        now,
      )
    } catch (err: any) {
      if (/no such table/i.test(err?.message || '')) return null
      throw err
    }

    return {
      id,
      scope: data.scope,
      category: data.category,
      candidate_text: data.candidate_text,
      source_message_id: data.source_message_id ?? null,
      workspace_id: data.workspace_id ?? null,
      status: data.status,
      created_at: now,
      decided_at: null,
    }
  }

  existsPending(scope: 'global' | 'workspace', text: string, workspaceId?: string | null): boolean {
    const db = getDatabase()
    try {
      const row = db.prepare(
        `SELECT id FROM memory_candidates
         WHERE scope = ? AND candidate_text = ? AND status = 'pending'
         AND COALESCE(workspace_id, '') = COALESCE(?, '')
         LIMIT 1`
      ).get(scope, text, workspaceId ?? null) as { id: string } | undefined
      return !!row
    } catch (err: any) {
      if (/no such table/i.test(err?.message || '')) return false
      throw err
    }
  }

  list(status?: 'pending' | 'approved' | 'rejected'): MemoryCandidate[] {
    const db = getDatabase()
    try {
      if (status) {
        return db
          .prepare('SELECT * FROM memory_candidates WHERE status = ? ORDER BY created_at DESC')
          .all(status) as MemoryCandidate[]
      }
      return db
        .prepare('SELECT * FROM memory_candidates ORDER BY created_at DESC')
        .all() as MemoryCandidate[]
    } catch (err: any) {
      if (/no such table/i.test(err?.message || '')) return []
      throw err
    }
  }

  getById(id: string): MemoryCandidate | null {
    const db = getDatabase()
    try {
      const row = db.prepare('SELECT * FROM memory_candidates WHERE id = ?').get(id) as MemoryCandidate | undefined
      return row ?? null
    } catch (err: any) {
      if (/no such table/i.test(err?.message || '')) return null
      throw err
    }
  }

  markStatus(id: string, status: 'approved' | 'rejected'): void {
    const db = getDatabase()
    const now = new Date().toISOString()
    try {
      db.prepare('UPDATE memory_candidates SET status = ?, decided_at = ? WHERE id = ?').run(status, now, id)
    } catch (err: any) {
      if (/no such table/i.test(err?.message || '')) return
      throw err
    }
  }
}

import { getDatabase } from '../database'
import type { WorkspaceMemory } from '../../../shared/types'

export class WorkspaceMemoryRepository {
  getByWorkspaceId(workspaceId: string): WorkspaceMemory | null {
    const db = getDatabase()
    try {
      const row = db
        .prepare('SELECT * FROM workspace_memories WHERE workspace_id = ?')
        .get(workspaceId) as WorkspaceMemory | undefined
      return row ?? null
    } catch (err: any) {
      if (/no such table/i.test(err?.message || '')) return null
      throw err
    }
  }

  upsert(workspaceId: string, content: string): WorkspaceMemory {
    const db = getDatabase()
    const now = new Date().toISOString()
    try {
      db.prepare(
        `INSERT INTO workspace_memories (workspace_id, content, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(workspace_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`
      ).run(workspaceId, content, now)
    } catch (err: any) {
      if (!/no such table/i.test(err?.message || '')) throw err
    }

    return {
      workspace_id: workspaceId,
      content,
      updated_at: now,
    }
  }
}

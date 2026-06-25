import { getDatabase } from '../database'
import { randomUUID } from 'crypto'

/**
 * Artifact 实体
 */
export interface ArtifactEntity {
  id: string
  task_id: string
  tool_call_id: string | null
  workspace_id: string | null
  artifact_type: string // markdown | docx | pptx
  name: string
  relative_path: string
  absolute_path: string
  mime_type: string | null
  size_bytes: number
  file_hash: string | null
  status: string // created | deleted
  created_at: string
}

export interface CreateArtifactInput {
  id?: string
  task_id: string
  tool_call_id?: string | null
  workspace_id?: string | null
  artifact_type: string
  name: string
  relative_path: string
  absolute_path: string
  mime_type?: string | null
  size_bytes: number
  file_hash?: string | null
}

/**
 * Artifact Repository - 生成物记录表的 CRUD 操作
 */
export class ArtifactRepository {
  create(data: CreateArtifactInput): ArtifactEntity {
    const db = getDatabase()
    const id = data.id || randomUUID()
    const now = new Date().toISOString()

    db.prepare(
      `INSERT INTO artifacts (id, task_id, tool_call_id, workspace_id, artifact_type, name, relative_path, absolute_path, mime_type, size_bytes, file_hash, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'created', ?)`
    ).run(
      id,
      data.task_id,
      data.tool_call_id ?? null,
      data.workspace_id ?? null,
      data.artifact_type,
      data.name,
      data.relative_path,
      data.absolute_path,
      data.mime_type ?? null,
      data.size_bytes,
      data.file_hash ?? null,
      now
    )

    return this.getById(id)!
  }

  getById(id: string): ArtifactEntity | null {
    const db = getDatabase()
    const row = db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id) as
      | ArtifactEntity
      | undefined
    return row ?? null
  }

  getByTaskId(taskId: string): ArtifactEntity[] {
    const db = getDatabase()
    return db
      .prepare('SELECT * FROM artifacts WHERE task_id = ? ORDER BY created_at ASC')
      .all(taskId) as ArtifactEntity[]
  }

  getByType(artifactType: string): ArtifactEntity[] {
    const db = getDatabase()
    return db
      .prepare('SELECT * FROM artifacts WHERE artifact_type = ? ORDER BY created_at DESC')
      .all(artifactType) as ArtifactEntity[]
  }

  countByTaskId(taskId: string): number {
    const db = getDatabase()
    const row = db
      .prepare('SELECT COUNT(*) as count FROM artifacts WHERE task_id = ?')
      .get(taskId) as { count: number }
    return row.count
  }

  markDeleted(id: string): void {
    const db = getDatabase()
    db.prepare("UPDATE artifacts SET status = 'deleted' WHERE id = ?").run(id)
  }
}

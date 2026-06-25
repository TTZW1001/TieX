import { getDatabase } from '../database'
import { randomUUID } from 'crypto'

/**
 * FileChange 实体
 */
export interface FileChangeEntity {
  id: string
  task_id: string
  tool_call_id: string | null
  workspace_id: string | null
  relative_path: string
  operation: string // create | modify
  backup_path: string | null
  before_hash: string | null
  after_hash: string | null
  before_size: number | null
  after_size: number | null
  diff_summary: string | null
  status: string // applied | reverted
  changed_at: string
  reverted_at: string | null
}

export interface CreateFileChangeInput {
  id?: string
  task_id: string
  tool_call_id?: string | null
  workspace_id?: string | null
  relative_path: string
  operation: string
  backup_path?: string | null
  before_hash?: string | null
  after_hash?: string | null
  before_size?: number | null
  after_size?: number | null
  diff_summary?: string | null
}

/**
 * FileChange Repository - 文件变更记录表的 CRUD 操作
 */
export class FileChangeRepository {
  create(data: CreateFileChangeInput): FileChangeEntity {
    const db = getDatabase()
    const id = data.id || randomUUID()
    const now = new Date().toISOString()

    db.prepare(
      `INSERT INTO file_changes (id, task_id, tool_call_id, workspace_id, relative_path, operation, backup_path, before_hash, after_hash, before_size, after_size, diff_summary, status, changed_at, reverted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'applied', ?, NULL)`
    ).run(
      id,
      data.task_id,
      data.tool_call_id ?? null,
      data.workspace_id ?? null,
      data.relative_path,
      data.operation,
      data.backup_path ?? null,
      data.before_hash ?? null,
      data.after_hash ?? null,
      data.before_size ?? null,
      data.after_size ?? null,
      data.diff_summary ?? null,
      now
    )

    return this.getById(id)!
  }

  getById(id: string): FileChangeEntity | null {
    const db = getDatabase()
    const row = db.prepare('SELECT * FROM file_changes WHERE id = ?').get(id) as
      | FileChangeEntity
      | undefined
    return row ?? null
  }

  getByTaskId(taskId: string): FileChangeEntity[] {
    const db = getDatabase()
    return db
      .prepare('SELECT * FROM file_changes WHERE task_id = ? ORDER BY changed_at ASC')
      .all(taskId) as FileChangeEntity[]
  }

  getByTaskAndPath(taskId: string, relativePath: string): FileChangeEntity | null {
    const db = getDatabase()
    const row = db
      .prepare('SELECT * FROM file_changes WHERE task_id = ? AND relative_path = ? ORDER BY changed_at DESC LIMIT 1')
      .get(taskId, relativePath) as FileChangeEntity | undefined
    return row ?? null
  }

  getAppliedByTaskId(taskId: string): FileChangeEntity[] {
    const db = getDatabase()
    return db
      .prepare("SELECT * FROM file_changes WHERE task_id = ? AND status = 'applied' ORDER BY changed_at ASC")
      .all(taskId) as FileChangeEntity[]
  }

  countByTaskId(taskId: string): number {
    const db = getDatabase()
    const row = db
      .prepare('SELECT COUNT(*) as count FROM file_changes WHERE task_id = ?')
      .get(taskId) as { count: number }
    return row.count
  }

  markReverted(id: string): void {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare(
      "UPDATE file_changes SET status = 'reverted', reverted_at = ? WHERE id = ?"
    ).run(now, id)
  }
}

import { getDatabase } from '../database'
import { randomUUID } from 'crypto'
import type { ToolCallEntity, CreateToolCallInput } from '../../../shared/types'

/**
 * ToolCall Repository - 工具调用表的 CRUD 操作
 */
export class ToolCallRepository {
  create(data: CreateToolCallInput): ToolCallEntity {
    const db = getDatabase()
    const id = data.id || randomUUID()
    const now = new Date().toISOString()

    db.prepare(
      `INSERT INTO tool_calls (id, task_id, step_id, tool_name, arguments, status, result, error_code, error_message, duration_ms, started_at, completed_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, NULL, NULL, NULL, ?)`
    ).run(id, data.task_id, data.step_id ?? null, data.tool_name, data.arguments, now)

    return this.getById(id)!
  }

  getById(id: string): ToolCallEntity | null {
    const db = getDatabase()
    const row = db.prepare('SELECT * FROM tool_calls WHERE id = ?').get(id) as
      | ToolCallEntity
      | undefined
    return row ?? null
  }

  getByTaskId(taskId: string): ToolCallEntity[] {
    const db = getDatabase()
    return db
      .prepare('SELECT * FROM tool_calls WHERE task_id = ? ORDER BY created_at ASC')
      .all(taskId) as ToolCallEntity[]
  }

  updateResult(id: string, result: string): void {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare(
      'UPDATE tool_calls SET result = ?, status = ?, completed_at = ? WHERE id = ?'
    ).run(result, 'completed', now, id)
  }

  updateError(id: string, code: string, message: string): void {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare(
      'UPDATE tool_calls SET error_code = ?, error_message = ?, status = ?, completed_at = ? WHERE id = ?'
    ).run(code, message, 'failed', now, id)
  }

  updateStatus(id: string, status: string): void {
    const db = getDatabase()
    const now = new Date().toISOString()

    if (status === 'running' || status === 'executing') {
      db.prepare(
        'UPDATE tool_calls SET status = ?, started_at = COALESCE(started_at, ?) WHERE id = ?'
      ).run(status, now, id)
    } else if (status === 'completed' || status === 'failed') {
      db.prepare(
        'UPDATE tool_calls SET status = ?, completed_at = COALESCE(completed_at, ?) WHERE id = ?'
      ).run(status, now, id)
    } else {
      db.prepare('UPDATE tool_calls SET status = ? WHERE id = ?').run(status, id)
    }
  }

  updateDuration(id: string, durationMs: number): void {
    const db = getDatabase()
    db.prepare('UPDATE tool_calls SET duration_ms = ? WHERE id = ?').run(durationMs, id)
  }
}

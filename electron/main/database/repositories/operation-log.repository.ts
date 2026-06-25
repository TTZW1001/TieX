import { getDatabase } from '../database'
import { randomUUID } from 'crypto'
import type { OperationLogEntity, CreateOperationLogInput } from '../../../shared/types'

/**
 * OperationLog Repository - 操作日志表的 CRUD 操作
 */
export class OperationLogRepository {
  create(data: CreateOperationLogInput): OperationLogEntity {
    const db = getDatabase()
    const id = data.id || randomUUID()
    const now = new Date().toISOString()
    const level = data.level ?? 'info'

    db.prepare(
      `INSERT INTO operation_logs (id, task_id, conversation_id, log_type, level, message, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      data.task_id,
      data.conversation_id ?? null,
      data.log_type,
      level,
      data.message,
      data.details ?? null,
      now
    )

    return this.getById(id)!
  }

  getById(id: string): OperationLogEntity | null {
    const db = getDatabase()
    const row = db.prepare('SELECT * FROM operation_logs WHERE id = ?').get(id) as
      | OperationLogEntity
      | undefined
    return row ?? null
  }

  getByTaskId(taskId: string, limit: number = 200): OperationLogEntity[] {
    const db = getDatabase()
    return db
      .prepare(
        'SELECT * FROM operation_logs WHERE task_id = ? ORDER BY created_at ASC LIMIT ?'
      )
      .all(taskId, limit) as OperationLogEntity[]
  }
}

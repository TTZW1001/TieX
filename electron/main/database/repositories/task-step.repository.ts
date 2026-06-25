import { getDatabase } from '../database'
import { randomUUID } from 'crypto'
import type { TaskStepEntity, CreateTaskStepInput } from '../../../shared/types'

/**
 * TaskStep Repository - 任务步骤表的 CRUD 操作
 */
export class TaskStepRepository {
  create(data: CreateTaskStepInput): TaskStepEntity {
    const db = getDatabase()
    const id = data.id || randomUUID()
    const now = new Date().toISOString()

    db.prepare(
      `INSERT INTO task_steps (id, task_id, sequence_no, step_type, status, content, started_at, completed_at, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?, NULL, NULL, ?)`
    ).run(id, data.task_id, data.sequence_no, data.step_type, data.content ?? null, now)

    return this.getById(id)!
  }

  getById(id: string): TaskStepEntity | null {
    const db = getDatabase()
    const row = db.prepare('SELECT * FROM task_steps WHERE id = ?').get(id) as
      | TaskStepEntity
      | undefined
    return row ?? null
  }

  getByTaskId(taskId: string): TaskStepEntity[] {
    const db = getDatabase()
    return db
      .prepare('SELECT * FROM task_steps WHERE task_id = ? ORDER BY sequence_no ASC')
      .all(taskId) as TaskStepEntity[]
  }

  updateStatus(id: string, status: string): void {
    const db = getDatabase()
    const now = new Date().toISOString()

    if (status === 'running' || status === 'executing') {
      db.prepare(
        'UPDATE task_steps SET status = ?, started_at = COALESCE(started_at, ?), created_at = created_at WHERE id = ?'
      ).run(status, now, id)
    } else if (status === 'completed' || status === 'failed') {
      db.prepare(
        'UPDATE task_steps SET status = ?, completed_at = ? WHERE id = ?'
      ).run(status, now, id)
    } else {
      db.prepare('UPDATE task_steps SET status = ? WHERE id = ?').run(status, id)
    }
  }

  updateContent(id: string, content: string): void {
    const db = getDatabase()
    db.prepare('UPDATE task_steps SET content = ? WHERE id = ?').run(content, id)
  }

  /** 获取下一个序号 */
  getNextSequenceNo(taskId: string): number {
    const db = getDatabase()
    const row = db
      .prepare('SELECT MAX(sequence_no) as max_seq FROM task_steps WHERE task_id = ?')
      .get(taskId) as { max_seq: number | null } | undefined
    return (row?.max_seq ?? 0) + 1
  }
}

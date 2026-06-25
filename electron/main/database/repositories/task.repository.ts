import { getDatabase } from '../database'
import { randomUUID } from 'crypto'
import type { TaskEntity, CreateTaskInput, TaskStatus } from '../../../shared/types'

/**
 * Task Repository - 任务表的 CRUD 操作
 */
export class TaskRepository {
  create(data: CreateTaskInput): TaskEntity {
    const db = getDatabase()
    const id = data.id || randomUUID()
    const now = new Date().toISOString()
    const permissionMode = data.permission_mode ?? 'read'

    db.prepare(
      `INSERT INTO tasks (id, conversation_id, user_message_id, provider_id, workspace_id, permission_mode, status, title, round_count, tool_call_count, failure_count, started_at, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, 0, 0, 0, NULL, NULL, ?, ?)`
    ).run(
      id,
      data.conversation_id,
      data.user_message_id ?? null,
      data.provider_id,
      data.workspace_id ?? null,
      permissionMode,
      data.title ?? null,
      now,
      now
    )

    return this.getById(id)!
  }

  getById(id: string): TaskEntity | null {
    const db = getDatabase()
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as
      | TaskEntity
      | undefined
    return row ?? null
  }

  getByConversationId(conversationId: string): TaskEntity[] {
    const db = getDatabase()
    return db
      .prepare('SELECT * FROM tasks WHERE conversation_id = ? ORDER BY created_at DESC')
      .all(conversationId) as TaskEntity[]
  }

  getRunningTasks(): TaskEntity[] {
    const db = getDatabase()
    return db
      .prepare("SELECT * FROM tasks WHERE status IN ('running', 'executing_tool')")
      .all() as TaskEntity[]
  }

  updateStatus(
    id: string,
    status: TaskStatus,
    extra?: Partial<Pick<TaskEntity, 'error_code' | 'error_message' | 'started_at' | 'completed_at' | 'round_count' | 'tool_call_count' | 'failure_count'>>
  ): void {
    const db = getDatabase()
    const now = new Date().toISOString()
    const fields: string[] = ['status = ?', 'updated_at = ?']
    const values: any[] = [status, now]

    if (extra) {
      if (extra.error_code !== undefined) {
        fields.push('error_code = ?')
        values.push(extra.error_code)
      }
      if (extra.error_message !== undefined) {
        fields.push('error_message = ?')
        values.push(extra.error_message)
      }
      if (extra.started_at !== undefined) {
        fields.push('started_at = ?')
        values.push(extra.started_at)
      }
      if (extra.completed_at !== undefined) {
        fields.push('completed_at = ?')
        values.push(extra.completed_at)
      }
      if (extra.round_count !== undefined) {
        fields.push('round_count = ?')
        values.push(extra.round_count)
      }
      if (extra.tool_call_count !== undefined) {
        fields.push('tool_call_count = ?')
        values.push(extra.tool_call_count)
      }
      if (extra.failure_count !== undefined) {
        fields.push('failure_count = ?')
        values.push(extra.failure_count)
      }
    }

    values.push(id)
    db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  }

  incrementRound(id: string): void {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare(
      'UPDATE tasks SET round_count = round_count + 1, updated_at = ? WHERE id = ?'
    ).run(now, id)
  }

  incrementToolCallCount(id: string): void {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare(
      'UPDATE tasks SET tool_call_count = tool_call_count + 1, updated_at = ? WHERE id = ?'
    ).run(now, id)
  }

  incrementFailureCount(id: string): void {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare(
      'UPDATE tasks SET failure_count = failure_count + 1, updated_at = ? WHERE id = ?'
    ).run(now, id)
  }
}

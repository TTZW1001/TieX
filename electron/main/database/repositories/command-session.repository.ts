import { getDatabase } from '../database'

export interface CommandSessionEntity {
  session_id: string
  task_id: string | null
  command: string
  args: string
  status: 'running' | 'completed' | 'failed' | 'stopped' | 'timeout'
  exit_code: number | null
  output: string
  truncated: number
  started_at: string
  completed_at: string | null
  updated_at: string
}

export interface CreateCommandSessionInput {
  session_id: string
  task_id?: string | null
  command: string
  args: string[]
  status?: CommandSessionEntity['status']
  started_at?: string
}

export class CommandSessionRepository {
  create(data: CreateCommandSessionInput): CommandSessionEntity {
    const db = getDatabase()
    const now = new Date().toISOString()
    const startedAt = data.started_at ?? now
    db.prepare(
      `INSERT OR REPLACE INTO command_sessions (
        session_id, task_id, command, args, status, exit_code, output, truncated, started_at, completed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, NULL, '', 0, ?, NULL, ?)`
    ).run(
      data.session_id,
      data.task_id ?? null,
      data.command,
      JSON.stringify(data.args),
      data.status ?? 'running',
      startedAt,
      now
    )

    return this.getById(data.session_id)!
  }

  getById(sessionId: string): CommandSessionEntity | null {
    const db = getDatabase()
    const row = db.prepare('SELECT * FROM command_sessions WHERE session_id = ?').get(sessionId) as
      | CommandSessionEntity
      | undefined
    return row ?? null
  }

  getByTaskId(taskId: string): CommandSessionEntity[] {
    const db = getDatabase()
    return db
      .prepare('SELECT * FROM command_sessions WHERE task_id = ? ORDER BY started_at ASC')
      .all(taskId) as CommandSessionEntity[]
  }

  appendOutput(sessionId: string, chunk: string, output: string, truncated: boolean): void {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare(
      'UPDATE command_sessions SET output = ?, truncated = ?, updated_at = ? WHERE session_id = ?'
    ).run(output || chunk, truncated ? 1 : 0, now, sessionId)
  }

  updateCompleted(
    sessionId: string,
    status: CommandSessionEntity['status'],
    exitCode: number | null,
    output: string,
    truncated: boolean,
    completedAt?: string | null
  ): void {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare(
      `UPDATE command_sessions
       SET status = ?, exit_code = ?, output = ?, truncated = ?, completed_at = ?, updated_at = ?
       WHERE session_id = ?`
    ).run(status, exitCode, output, truncated ? 1 : 0, completedAt ?? now, now, sessionId)
  }
}

import { getDatabase } from '../database'
import { randomUUID } from 'crypto'

/**
 * PermissionRequest 实体
 */
export interface PermissionRequestEntity {
  id: string
  task_id: string
  tool_call_id: string
  permission_type: string
  title: string
  reason: string | null
  target: string | null
  impact_summary: string | null
  risk_level: string
  status: string // pending | approved | rejected | cancelled
  decision_scope: string | null // once | task
  requested_at: string
  decided_at: string | null
}

export interface CreatePermissionRequestInput {
  id?: string
  task_id: string
  tool_call_id: string
  permission_type: string
  title: string
  reason?: string
  target?: string
  impact_summary?: string
  risk_level?: string
}

/**
 * PermissionRequest Repository - 权限审批请求表的 CRUD 操作
 */
export class PermissionRequestRepository {
  create(data: CreatePermissionRequestInput): PermissionRequestEntity {
    const db = getDatabase()
    const id = data.id || randomUUID()
    const now = new Date().toISOString()

    db.prepare(
      `INSERT INTO permission_requests (id, task_id, tool_call_id, permission_type, title, reason, target, impact_summary, risk_level, status, decision_scope, requested_at, decided_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, NULL)`
    ).run(
      id,
      data.task_id,
      data.tool_call_id,
      data.permission_type,
      data.title,
      data.reason ?? null,
      data.target ?? null,
      data.impact_summary ?? null,
      data.risk_level ?? 'medium',
      now
    )

    return this.getById(id)!
  }

  getById(id: string): PermissionRequestEntity | null {
    const db = getDatabase()
    const row = db.prepare('SELECT * FROM permission_requests WHERE id = ?').get(id) as
      | PermissionRequestEntity
      | undefined
    return row ?? null
  }

  getByTaskId(taskId: string): PermissionRequestEntity[] {
    const db = getDatabase()
    return db
      .prepare('SELECT * FROM permission_requests WHERE task_id = ? ORDER BY requested_at ASC')
      .all(taskId) as PermissionRequestEntity[]
  }

  getPendingByTaskId(taskId: string): PermissionRequestEntity[] {
    const db = getDatabase()
    return db
      .prepare("SELECT * FROM permission_requests WHERE task_id = ? AND status = 'pending' ORDER BY requested_at ASC")
      .all(taskId) as PermissionRequestEntity[]
  }

  getApprovedForTask(taskId: string, permissionType: string): PermissionRequestEntity[] {
    const db = getDatabase()
    return db
      .prepare("SELECT * FROM permission_requests WHERE task_id = ? AND permission_type = ? AND status = 'approved' AND decision_scope = 'task'")
      .all(taskId, permissionType) as PermissionRequestEntity[]
  }

  updateDecision(id: string, status: 'approved' | 'rejected' | 'cancelled', decisionScope?: 'once' | 'task'): void {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare(
      'UPDATE permission_requests SET status = ?, decision_scope = ?, decided_at = ? WHERE id = ?'
    ).run(status, decisionScope ?? null, now, id)
  }

  cancelPendingByTaskId(taskId: string): void {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare(
      "UPDATE permission_requests SET status = 'cancelled', decided_at = ? WHERE task_id = ? AND status = 'pending'"
    ).run(now, taskId)
  }

  hasTaskApproval(taskId: string, permissionType: string, target?: string): boolean {
    const db = getDatabase()
    if (target) {
      const row = db
        .prepare("SELECT id FROM permission_requests WHERE task_id = ? AND permission_type = ? AND target = ? AND status = 'approved' AND decision_scope = 'task' LIMIT 1")
        .get(taskId, permissionType, target) as { id: string } | undefined
      return !!row
    }
    const row = db
      .prepare("SELECT id FROM permission_requests WHERE task_id = ? AND permission_type = ? AND status = 'approved' AND decision_scope = 'task' LIMIT 1")
      .get(taskId, permissionType) as { id: string } | undefined
    return !!row
  }
}

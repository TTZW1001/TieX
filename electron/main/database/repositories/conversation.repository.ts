import { getDatabase } from '../database'
import type { Conversation, CreateConversationInput } from '../../../shared/types'
import { randomUUID } from 'crypto'

export class ConversationRepository {
  create(data: CreateConversationInput): Conversation {
    const db = getDatabase()
    const id = randomUUID()
    const now = new Date().toISOString()
    const title = data.title ?? '新对话'
    const permissionMode = data.permission_mode ?? 'chat'
    const status = 'active'

    db.prepare(
      `INSERT INTO conversations (id, title, provider_id, workspace_id, permission_mode, status, is_pinned, last_message_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`
    ).run(id, title, data.provider_id ?? null, data.workspace_id ?? null, permissionMode, status, now, now)

    return {
      id,
      title,
      provider_id: data.provider_id ?? null,
      workspace_id: data.workspace_id ?? null,
      permission_mode: permissionMode,
      status,
      is_pinned: 0,
      last_message_at: null,
      created_at: now,
      updated_at: now,
    }
  }

  getById(id: string): Conversation | null {
    const db = getDatabase()
    const row = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as
      | Conversation
      | undefined
    return row ?? null
  }

  getRecent(limit: number = 20): Conversation[] {
    const db = getDatabase()
    return db
      .prepare(
        'SELECT * FROM conversations WHERE status = ? ORDER BY updated_at DESC LIMIT ?'
      )
      .all('active', limit) as Conversation[]
  }

  updateTitle(id: string, title: string): void {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?').run(
      title,
      now,
      id
    )
  }

  deleteById(id: string): void {
    const db = getDatabase()

    // 通用级联删除：尝试多种 schema 组合
    // 历史数据库的 tasks / task_steps / tool_calls / operation_logs / artifacts
    // / file_changes / permission_requests 表对 conversations 没有 ON DELETE CASCADE，
    // 这里在事务里显式级联删，保证新旧数据库都能正确删除。
    const safeRun = (sql: string, ...params: any[]) => {
      try {
        db.prepare(sql).run(...params)
      } catch (err: any) {
        // 表不存在或列不存在时跳过，不影响整体删除
        const msg = err?.message || String(err)
        if (/no such table/i.test(msg) || /no such column/i.test(msg)) {
          console.warn('[conversation:delete] skip (schema mismatch):', sql, '→', msg)
          return
        }
        throw err
      }
    }

    const tx = db.transaction((conversationId: string) => {
      // 延迟外键检查到事务结束，避免级联删除顺序问题
      try {
        db.pragma('defer_foreign_keys = ON')
      } catch {
        // 旧版 better-sqlite3 不支持时忽略
      }

      // 1. 找出该会话下所有任务 ID（兼容 conversation_id 列可能不存在的情况）
      let taskIds: string[] = []
      try {
        const taskRows = db
          .prepare('SELECT id FROM tasks WHERE conversation_id = ?')
          .all(conversationId) as Array<{ id: string }>
        taskIds = taskRows.map((r) => r.id)
      } catch (err: any) {
        // tasks 表不存在或没有 conversation_id 列
        const msg = err?.message || String(err)
        console.warn('[conversation:delete] cannot read tasks:', msg)
      }

      if (taskIds.length > 0) {
        const placeholders = taskIds.map(() => '?').join(',')
        // 删除顺序很重要：必须先删引用 tool_calls / task_steps 的表
        // 1. 删 task_steps（无被引用）
        safeRun(`DELETE FROM task_steps WHERE task_id IN (${placeholders})`, ...taskIds)
        // 2. 删 permission_requests（引用 tool_calls，必须在 tool_calls 之前）
        safeRun(
          `DELETE FROM permission_requests WHERE task_id IN (${placeholders})`,
          ...taskIds
        )
        // 3. 删 file_changes（引用 tool_calls）
        safeRun(`DELETE FROM file_changes WHERE task_id IN (${placeholders})`, ...taskIds)
        // 4. 删 artifacts（引用 tool_calls）
        safeRun(`DELETE FROM artifacts WHERE task_id IN (${placeholders})`, ...taskIds)
        // 5. 删 tool_calls（此时已无被引用）
        safeRun(`DELETE FROM tool_calls WHERE task_id IN (${placeholders})`, ...taskIds)
        // 6. 删 operation_logs（引用 task_steps，task_steps 已删，安全）
        safeRun(`DELETE FROM operation_logs WHERE task_id IN (${placeholders})`, ...taskIds)
      }

      // 8. 删 tasks 本身
      safeRun('DELETE FROM tasks WHERE conversation_id = ?', conversationId)
      // 9. 删 messages
      safeRun('DELETE FROM messages WHERE conversation_id = ?', conversationId)
      // 10. 删其他可能引用 conversation 的表
      safeRun('DELETE FROM conversation_attachments WHERE conversation_id = ?', conversationId)
      safeRun('DELETE FROM conversation_settings WHERE conversation_id = ?', conversationId)

      // 11. 最后删会话本身
      safeRun('DELETE FROM conversations WHERE id = ?', conversationId)
    })

    tx(id)
  }
}

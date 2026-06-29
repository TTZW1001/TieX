import { getDatabase } from '../database'
import type { Message, CreateMessageInput } from '../../../shared/types'
import { randomUUID } from 'crypto'

export class MessageRepository {
  create(data: CreateMessageInput): Message {
    const db = getDatabase()
    const id = randomUUID()
    const now = new Date().toISOString()
    const contentType = data.content_type ?? 'text'

    db.prepare(
      `INSERT INTO messages (id, conversation_id, task_id, role, content, content_type, tool_call_id, sequence_no, token_count, is_streaming, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
    ).run(
      id,
      data.conversation_id,
      data.task_id ?? null,
      data.role,
      data.content,
      contentType,
      data.tool_call_id ?? null,
      data.sequence_no,
      data.token_count ?? null,
      now,
      now
    )

    return {
      id,
      conversation_id: data.conversation_id,
      task_id: data.task_id ?? null,
      role: data.role,
      content: data.content,
      content_type: contentType,
      tool_call_id: data.tool_call_id ?? null,
      sequence_no: data.sequence_no,
      token_count: data.token_count ?? null,
      is_streaming: 0,
      created_at: now,
      updated_at: now,
    }
  }

  getByConversationId(conversationId: string): Message[] {
    const db = getDatabase()
    return db
      .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY sequence_no ASC')
      .all(conversationId) as Message[]
  }

  getRecentByConversationId(conversationId: string, limit: number): Message[] {
    const db = getDatabase()
    return db
      .prepare(
        `SELECT * FROM (
          SELECT * FROM messages
          WHERE conversation_id = ?
          ORDER BY sequence_no DESC
          LIMIT ?
        ) recent
        ORDER BY sequence_no ASC`
      )
      .all(conversationId, limit) as Message[]
  }

  getById(id: string): Message | null {
    const db = getDatabase()
    const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as
      | Message
      | undefined
    return row ?? null
  }

  updateContent(id: string, content: string): void {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare('UPDATE messages SET content = ?, updated_at = ? WHERE id = ?').run(
      content,
      now,
      id
    )
  }

  updateTokenCount(id: string, tokenCount: number | null): void {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare('UPDATE messages SET token_count = ?, updated_at = ? WHERE id = ?').run(
      tokenCount,
      now,
      id
    )
  }

  updateTaskId(id: string, taskId: string | null): void {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare('UPDATE messages SET task_id = ?, updated_at = ? WHERE id = ?').run(
      taskId,
      now,
      id
    )
  }

  setStreaming(id: string, isStreaming: number): void {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare('UPDATE messages SET is_streaming = ?, updated_at = ? WHERE id = ?').run(
      isStreaming,
      now,
      id
    )
  }

  getLatestByConversationId(conversationId: string): Message | null {
    const db = getDatabase()
    const row = db
      .prepare(
        'SELECT * FROM messages WHERE conversation_id = ? ORDER BY sequence_no DESC LIMIT 1'
      )
      .get(conversationId) as Message | undefined
    return row ?? null
  }

  getByConversationIdPaged(conversationId: string, limit: number = 50, offset: number = 0): Message[] {
    const db = getDatabase()
    return db
      .prepare(
        'SELECT * FROM messages WHERE conversation_id = ? ORDER BY sequence_no ASC LIMIT ? OFFSET ?'
      )
      .all(conversationId, limit, offset) as Message[]
  }

  countByConversationId(conversationId: string): number {
    const db = getDatabase()
    const row = db
      .prepare('SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?')
      .get(conversationId) as { count: number } | undefined
    return row?.count ?? 0
  }
}

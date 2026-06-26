import { getDatabase } from '../database'
import type { ConversationSummary } from '../../../shared/types'

export class ConversationSummaryRepository {
  getByConversationId(conversationId: string): ConversationSummary | null {
    const db = getDatabase()
    const row = db
      .prepare('SELECT * FROM conversation_summaries WHERE conversation_id = ?')
      .get(conversationId) as ConversationSummary | undefined
    return row ?? null
  }

  upsert(conversationId: string, summary: string, messageCount: number): ConversationSummary {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO conversation_summaries (conversation_id, summary, message_count, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(conversation_id) DO UPDATE SET
         summary = excluded.summary,
         message_count = excluded.message_count,
         updated_at = excluded.updated_at`
    ).run(conversationId, summary, messageCount, now)

    return {
      conversation_id: conversationId,
      summary,
      message_count: messageCount,
      updated_at: now,
    }
  }
}

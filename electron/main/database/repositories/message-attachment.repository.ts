import { randomUUID } from 'crypto'
import { getDatabase } from '../database'
import type { CreateMessageAttachmentInput, MessageAttachment } from '../../../shared/types'

export class MessageAttachmentRepository {
  create(data: CreateMessageAttachmentInput): MessageAttachment {
    const db = getDatabase()
    const id = randomUUID()
    const now = new Date().toISOString()

    try {
      db.prepare(
        `INSERT INTO message_attachments (
          id, message_id, conversation_id, kind, file_name, mime_type, original_path, size_bytes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        data.message_id,
        data.conversation_id,
        data.kind,
        data.file_name,
        data.mime_type ?? null,
        data.original_path,
        data.size_bytes ?? null,
        now,
      )
    } catch (err: any) {
      if (/no such table/i.test(err?.message || '')) {
        return {
          id,
          message_id: data.message_id,
          conversation_id: data.conversation_id,
          kind: data.kind,
          file_name: data.file_name,
          mime_type: data.mime_type ?? null,
          original_path: data.original_path,
          size_bytes: data.size_bytes ?? null,
          created_at: now,
        }
      }
      throw err
    }

    return {
      id,
      message_id: data.message_id,
      conversation_id: data.conversation_id,
      kind: data.kind,
      file_name: data.file_name,
      mime_type: data.mime_type ?? null,
      original_path: data.original_path,
      size_bytes: data.size_bytes ?? null,
      created_at: now,
    }
  }

  createMany(items: CreateMessageAttachmentInput[]): MessageAttachment[] {
    if (items.length === 0) return []
    const db = getDatabase()
    const tx = db.transaction((rows: CreateMessageAttachmentInput[]) => rows.map((row) => this.create(row)))
    return tx(items)
  }

  getByMessageId(messageId: string): MessageAttachment[] {
    const db = getDatabase()
    try {
      return db
        .prepare('SELECT * FROM message_attachments WHERE message_id = ? ORDER BY created_at ASC')
        .all(messageId) as MessageAttachment[]
    } catch (err: any) {
      if (/no such table/i.test(err?.message || '')) return []
      throw err
    }
  }

  getByConversationId(conversationId: string): MessageAttachment[] {
    const db = getDatabase()
    try {
      return db
        .prepare('SELECT * FROM message_attachments WHERE conversation_id = ? ORDER BY created_at ASC')
        .all(conversationId) as MessageAttachment[]
    } catch (err: any) {
      if (/no such table/i.test(err?.message || '')) return []
      throw err
    }
  }

  cloneForMessage(sourceMessageId: string, targetMessageId: string, targetConversationId: string): void {
    const attachments = this.getByMessageId(sourceMessageId)
    for (const attachment of attachments) {
      this.create({
        message_id: targetMessageId,
        conversation_id: targetConversationId,
        kind: attachment.kind,
        file_name: attachment.file_name,
        mime_type: attachment.mime_type,
        original_path: attachment.original_path,
        size_bytes: attachment.size_bytes,
      })
    }
  }
}

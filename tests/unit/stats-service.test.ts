import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'

let mockDb: Database.Database

vi.mock('@electron/main/database/database', () => ({
  getDatabase: () => mockDb,
}))

describe('StatsService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-27T10:35:00+08:00'))

    mockDb = new Database(':memory:')
    mockDb.exec(`
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        provider_id TEXT,
        workspace_id TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        token_count INTEGER,
        created_at TEXT NOT NULL
      );

      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL
      );

      CREATE TABLE workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        is_deleted INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE model_providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        model_name TEXT NOT NULL,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        is_enabled INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE conversation_summaries (
        conversation_id TEXT PRIMARY KEY,
        summary TEXT NOT NULL DEFAULT ''
      );
    `)

    mockDb.prepare(`
      INSERT INTO conversations (id, title, provider_id, workspace_id, status, created_at, updated_at)
      VALUES ('conv-1', '测试会话', 'provider-1', NULL, 'active', '2026-06-26T12:00:00.000Z', '2026-06-26T14:54:39.638Z')
    `).run()

    mockDb.prepare(`
      INSERT INTO model_providers (id, name, model_name, is_deleted, is_enabled)
      VALUES ('provider-1', 'DeepSeek', 'deepseek-v4-flash', 0, 1)
    `).run()

    const insertMessage = mockDb.prepare(`
      INSERT INTO messages (id, conversation_id, role, token_count, created_at)
      VALUES (?, 'conv-1', 'assistant', ?, ?)
    `)

    insertMessage.run('msg-1', 120, '2026-06-26T12:05:00+08:00')
    insertMessage.run('msg-2', 80, '2026-06-26T14:25:00+08:00')
  })

  afterEach(() => {
    vi.useRealTimers()
    mockDb.close()
  })

  it('hour 维度应补齐连续 24 个小时的桶，空桶 token 为 0', async () => {
    const { StatsService } = await import('@electron/main/services/stats.service')
    const service = new StatsService()

    const detail = service.getConversationDetail('conv-1')
    expect(detail).not.toBeNull()
    expect(detail!.token_series.hour).toHaveLength(24)

    const hourSeries = detail!.token_series.hour
    expect(hourSeries[0]?.bucket).toBe('2026-06-26 11:00')
    expect(hourSeries[23]?.bucket).toBe('2026-06-27 10:00')

    const bucket1200 = hourSeries.find((item) => item.bucket === '2026-06-26 12:00')
    const bucket1300 = hourSeries.find((item) => item.bucket === '2026-06-26 13:00')
    const bucket1400 = hourSeries.find((item) => item.bucket === '2026-06-26 14:00')

    expect(bucket1200?.tokens).toBe(120)
    expect(bucket1300?.tokens).toBe(0)
    expect(bucket1400?.tokens).toBe(80)
  })
})

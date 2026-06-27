import { getDatabase } from '../database/database'
import type {
  ConversationDetailStats,
  ModelUsageShare,
  StatsOverview,
  TokenPoint,
} from '../../shared/types'

type RangeKey = 'hour' | 'day' | 'week' | 'month'

type RangeConfig = {
  count: number
  floor(date: Date): Date
  add(date: Date, step: number): Date
  format(date: Date): string
}

const RANGE_CONFIG: Record<RangeKey, RangeConfig> = {
  hour: {
    count: 24,
    floor(date) {
      const next = new Date(date)
      next.setMinutes(0, 0, 0)
      return next
    },
    add(date, step) {
      const next = new Date(date)
      next.setHours(next.getHours() + step)
      return next
    },
    format(date) {
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:00`
    },
  },
  day: {
    count: 30,
    floor(date) {
      const next = new Date(date)
      next.setHours(0, 0, 0, 0)
      return next
    },
    add(date, step) {
      const next = new Date(date)
      next.setDate(next.getDate() + step)
      return next
    },
    format(date) {
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    },
  },
  week: {
    count: 12,
    floor(date) {
      const next = new Date(date)
      next.setHours(0, 0, 0, 0)
      const day = next.getDay()
      const diff = day === 0 ? -6 : 1 - day
      next.setDate(next.getDate() + diff)
      return next
    },
    add(date, step) {
      const next = new Date(date)
      next.setDate(next.getDate() + step * 7)
      return next
    },
    format(date) {
      return `${date.getFullYear()}-W${pad(getWeekNumber(date))}`
    },
  },
  month: {
    count: 12,
    floor(date) {
      return new Date(date.getFullYear(), date.getMonth(), 1)
    },
    add(date, step) {
      return new Date(date.getFullYear(), date.getMonth() + step, 1)
    },
    format(date) {
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
    },
  },
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function getWeekNumber(date: Date): number {
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  const thursday = new Date(target)
  const day = thursday.getDay()
  const diff = day === 0 ? -3 : 4 - day
  thursday.setDate(thursday.getDate() + diff)
  const yearStart = new Date(thursday.getFullYear(), 0, 1)
  const yearStartDay = yearStart.getDay()
  const yearStartDiff = yearStartDay === 0 ? -6 : 1 - yearStartDay
  yearStart.setDate(yearStart.getDate() + yearStartDiff)
  return Math.floor((thursday.getTime() - yearStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
}

function mapUsage(rows: Array<any>): ModelUsageShare[] {
  const total = rows.reduce((sum, row) => sum + (row.tokens ?? 0), 0) || 1
  return rows.map((row) => ({
    provider_id: row.provider_id ?? null,
    provider_name: row.provider_name ?? '未指定',
    model_name: row.model_name ?? '未知模型',
    tokens: row.tokens ?? 0,
    message_count: row.message_count ?? 0,
    percentage: Number((((row.tokens ?? 0) / total) * 100).toFixed(1)),
  }))
}

function buildSeries(
  db: ReturnType<typeof getDatabase>,
  whereSql: string,
  params: any[],
  range: RangeKey
): TokenPoint[] {
  const config = RANGE_CONFIG[range]
  const end = config.floor(new Date())
  const start = config.add(end, -(config.count - 1))

  const rows = db
    .prepare(
      `SELECT m.created_at, COALESCE(m.token_count, 0) AS tokens
       FROM messages m
       LEFT JOIN conversations c ON c.id = m.conversation_id
       ${whereSql}
       AND m.role = 'assistant'
       AND datetime(m.created_at) >= datetime(?)
       ORDER BY m.created_at ASC`
    )
    .all(...params, start.toISOString()) as Array<{ created_at: string; tokens: number }>

  const bucketMap = new Map<string, number>()
  for (let index = 0; index < config.count; index += 1) {
    const bucketDate = config.add(start, index)
    bucketMap.set(config.format(bucketDate), 0)
  }

  for (const row of rows) {
    const createdAt = new Date(row.created_at)
    if (Number.isNaN(createdAt.getTime())) continue
    const bucketKey = config.format(config.floor(createdAt))
    if (!bucketMap.has(bucketKey)) continue
    bucketMap.set(bucketKey, (bucketMap.get(bucketKey) ?? 0) + (row.tokens ?? 0))
  }

  return Array.from(bucketMap.entries()).map(([bucket, tokens]) => ({
    bucket,
    tokens,
  }))
}

export class StatsService {
  getOverview(): StatsOverview {
    const db = getDatabase()
    const workspaceCount = (db.prepare('SELECT COUNT(*) as count FROM workspaces WHERE is_deleted = 0').get() as any)?.count ?? 0
    const conversationCount = (db.prepare("SELECT COUNT(*) as count FROM conversations WHERE status = 'active'").get() as any)?.count ?? 0
    const totals = db
      .prepare(
        `SELECT COALESCE(SUM(token_count), 0) AS total_tokens,
                COUNT(*) AS assistant_message_count
         FROM messages
         WHERE role = 'assistant'`
      )
      .get() as any
    const activeProviderCount = (db.prepare('SELECT COUNT(*) as count FROM model_providers WHERE is_deleted = 0 AND is_enabled = 1').get() as any)?.count ?? 0

    const usageRows = db
      .prepare(
        `SELECT c.provider_id,
                COALESCE(p.name, '未指定') AS provider_name,
                COALESCE(p.model_name, '未知模型') AS model_name,
                COALESCE(SUM(m.token_count), 0) AS tokens,
                COUNT(m.id) AS message_count
         FROM messages m
         LEFT JOIN conversations c ON c.id = m.conversation_id
         LEFT JOIN model_providers p ON p.id = c.provider_id
         WHERE m.role = 'assistant'
         GROUP BY c.provider_id, provider_name, model_name
         ORDER BY tokens DESC`
      )
      .all() as Array<any>

    return {
      workspace_count: workspaceCount,
      conversation_count: conversationCount,
      total_tokens: totals?.total_tokens ?? 0,
      assistant_message_count: totals?.assistant_message_count ?? 0,
      active_provider_count: activeProviderCount,
      model_usage: mapUsage(usageRows),
      token_series: {
        hour: buildSeries(db, 'WHERE 1 = 1', [], 'hour'),
        day: buildSeries(db, 'WHERE 1 = 1', [], 'day'),
        week: buildSeries(db, 'WHERE 1 = 1', [], 'week'),
        month: buildSeries(db, 'WHERE 1 = 1', [], 'month'),
      },
    }
  }

  getConversationDetail(conversationId: string): ConversationDetailStats | null {
    const db = getDatabase()
    const conversation = db
      .prepare(
        `SELECT c.id, c.title, c.workspace_id, w.name AS workspace_name, s.summary
         FROM conversations c
         LEFT JOIN workspaces w ON w.id = c.workspace_id
         LEFT JOIN conversation_summaries s ON s.conversation_id = c.id
         WHERE c.id = ?`
      )
      .get(conversationId) as any

    if (!conversation) {
      return null
    }

    const totals = db
      .prepare(
        `SELECT COUNT(*) AS message_count,
                COALESCE(SUM(CASE WHEN role = 'assistant' THEN token_count ELSE 0 END), 0) AS total_tokens,
                MIN(created_at) AS first_message_at,
                MAX(created_at) AS last_message_at
         FROM messages
         WHERE conversation_id = ?`
      )
      .get(conversationId) as any

    const taskCount = (db.prepare('SELECT COUNT(*) as count FROM tasks WHERE conversation_id = ?').get(conversationId) as any)?.count ?? 0

    const usageRows = db
      .prepare(
        `SELECT c.provider_id,
                COALESCE(p.name, '未指定') AS provider_name,
                COALESCE(p.model_name, '未知模型') AS model_name,
                COALESCE(SUM(m.token_count), 0) AS tokens,
                COUNT(m.id) AS message_count
         FROM messages m
         LEFT JOIN conversations c ON c.id = m.conversation_id
         LEFT JOIN model_providers p ON p.id = c.provider_id
         WHERE m.conversation_id = ? AND m.role = 'assistant'
         GROUP BY c.provider_id, provider_name, model_name
         ORDER BY tokens DESC`
      )
      .all(conversationId) as Array<any>

    return {
      conversation_id: conversation.id,
      title: conversation.title,
      workspace_id: conversation.workspace_id ?? null,
      workspace_name: conversation.workspace_name ?? null,
      message_count: totals?.message_count ?? 0,
      task_count: taskCount,
      total_tokens: totals?.total_tokens ?? 0,
      first_message_at: totals?.first_message_at ?? null,
      last_message_at: totals?.last_message_at ?? null,
      summary: conversation.summary ?? '',
      model_usage: mapUsage(usageRows),
      token_series: {
        hour: buildSeries(db, 'WHERE m.conversation_id = ?', [conversationId], 'hour'),
        day: buildSeries(db, 'WHERE m.conversation_id = ?', [conversationId], 'day'),
        week: buildSeries(db, 'WHERE m.conversation_id = ?', [conversationId], 'week'),
        month: buildSeries(db, 'WHERE m.conversation_id = ?', [conversationId], 'month'),
      },
    }
  }
}

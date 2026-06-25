import { getDatabase } from '../database/database'

/** 日志清理服务 - 定期清理过期的任务步骤、工具调用等数据 */
export class LogCleaner {
  private timerId: ReturnType<typeof setInterval> | null = null

  /** 默认保留天数 */
  private static readonly DEFAULT_RETENTION_DAYS = 30

  /** 清理间隔（毫秒）：每 24 小时执行一次 */
  private static readonly CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000

  /**
   * 启动定期清理
   */
  start(): void {
    // 启动时立即执行一次
    this.clean()
    // 设置定时器
    this.timerId = setInterval(
      () => this.clean(),
      LogCleaner.CLEANUP_INTERVAL_MS
    )
  }

  /**
   * 停止定期清理
   */
  stop(): void {
    if (this.timerId) {
      clearInterval(this.timerId)
      this.timerId = null
    }
  }

  /**
   * 执行清理操作
   * @param retentionDays 保留天数，默认 30 天
   */
  clean(retentionDays: number = LogCleaner.DEFAULT_RETENTION_DAYS): {
    deletedSteps: number
    deletedToolCalls: number
    deletedMessages: number
  } {
    const db = getDatabase()
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays)
    const cutoff = cutoffDate.toISOString()

    // 清理已结束任务的旧 task_steps
    const stepsResult = db.prepare(`
      DELETE FROM task_steps
      WHERE task_id IN (
        SELECT t.id FROM tasks t
        WHERE t.status IN ('completed', 'failed', 'stopped')
        AND t.completed_at IS NOT NULL
        AND t.completed_at < ?
      )
    `).run(cutoff)

    // 清理已结束任务的旧 tool_calls
    const toolCallsResult = db.prepare(`
      DELETE FROM tool_calls
      WHERE task_id IN (
        SELECT t.id FROM tasks t
        WHERE t.status IN ('completed', 'failed', 'stopped')
        AND t.completed_at IS NOT NULL
        AND t.completed_at < ?
      )
    `).run(cutoff)

    // 清理已删除会话的消息
    const messagesResult = db.prepare(`
      DELETE FROM messages
      WHERE conversation_id IN (
        SELECT c.id FROM conversations c
        WHERE c.status = 'deleted'
        AND c.updated_at < ?
      )
    `).run(cutoff)

    // 清理已删除会话的任务
    db.prepare(`
      DELETE FROM tasks
      WHERE conversation_id IN (
        SELECT c.id FROM conversations c
        WHERE c.status = 'deleted'
        AND c.updated_at < ?
      )
    `).run(cutoff)

    // 清理已删除会话本身
    db.prepare(`
      DELETE FROM conversations
      WHERE status = 'deleted'
      AND updated_at < ?
    `).run(cutoff)

    return {
      deletedSteps: stepsResult.changes,
      deletedToolCalls: toolCallsResult.changes,
      deletedMessages: messagesResult.changes,
    }
  }
}

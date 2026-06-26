/**
 * Task Limits - 任务限制管理
 */
import type { TaskLimits as TaskLimitsConfig } from './agent-runtime'
import { SettingsRepository } from '../database/repositories/settings.repository'

/** 默认任务限制 */
export const DEFAULT_TASK_LIMITS: TaskLimitsConfig = {
  maxModelRounds: 20,
  maxToolCalls: 30,
  maxFailures: 3,
  maxDurationMs: 30 * 60 * 1000, // 30 分钟
  maxFilesRead: 100,
  maxFileSizeBytes: 2 * 1024 * 1024, // 2MB
  maxChangedFiles: 20, // 阶段六使用
  maxToolOutputChars: 50000,
}

function readPositiveInteger(key: string, fallback: number): number {
  try {
    const settingsRepo = new SettingsRepository()
    const raw = settingsRepo.get(key)
    const value = raw ? Number.parseInt(raw, 10) : Number.NaN
    return Number.isFinite(value) && value > 0 ? value : fallback
  } catch {
    return fallback
  }
}

export function loadTaskLimitsFromSettings(): TaskLimitsConfig {
  return {
    ...DEFAULT_TASK_LIMITS,
    maxModelRounds: readPositiveInteger('max_task_steps', DEFAULT_TASK_LIMITS.maxModelRounds),
  }
}

/** 任务限制超出的错误 */
export class TaskLimitExceededError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'TaskLimitExceededError'
  }
}

/**
 * 检查任务是否在限制范围内
 * 超出限制时抛出 TaskLimitExceededError
 */
export function checkWithinLimits(context: {
  round: number
  toolCallCount: number
  failureCount: number
  limits: TaskLimitsConfig
  startedAt: number
}): void {
  const { round, toolCallCount, failureCount, limits, startedAt } = context

  if (round >= limits.maxModelRounds) {
    throw new TaskLimitExceededError(
      'MAX_ROUNDS_EXCEEDED',
      `已达到最大轮数限制（${limits.maxModelRounds} 轮）`
    )
  }

  if (toolCallCount >= limits.maxToolCalls) {
    throw new TaskLimitExceededError(
      'MAX_TOOL_CALLS_EXCEEDED',
      `已达到最大工具调用次数限制（${limits.maxToolCalls} 次）`
    )
  }

  if (failureCount >= limits.maxFailures) {
    throw new TaskLimitExceededError(
      'MAX_FAILURES_EXCEEDED',
      `连续失败次数超过限制（${limits.maxFailures} 次）`
    )
  }

  const elapsed = Date.now() - startedAt
  if (elapsed > limits.maxDurationMs) {
    throw new TaskLimitExceededError(
      'MAX_DURATION_EXCEEDED',
      `任务执行时间超过限制（${Math.round(limits.maxDurationMs / 60000)} 分钟）`
    )
  }
}

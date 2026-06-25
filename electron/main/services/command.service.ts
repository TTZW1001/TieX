/**
 * CommandService - 命令执行调度服务
 * 负责命令策略检查、执行调度、日志记录
 */
import { checkCommand, type CommandCheckResult } from '../security/command-policy'
import {
  runCommand,
  stopCommand,
  getCommandOutput,
  getSession,
  stopAllCommands,
  cleanupSession,
  type RunCommandInput,
  type CommandSession,
  type CommandOutput,
} from './command-runner'
import { OperationLogRepository } from '../database/repositories/operation-log.repository'

const operationLogRepo = new OperationLogRepository()

export interface ExecuteCommandInput {
  command: string
  args: string[]
  cwd: string
  timeoutMs?: number
  maxOutputChars?: number
  taskId?: string
  conversationId?: string
}

export interface ExecuteCommandResult {
  ok: boolean
  session?: CommandSession
  error?: string
  checkResult?: CommandCheckResult
}

class CommandServiceImpl {
  /**
   * 执行命令（含策略检查）
   */
  async execute(input: ExecuteCommandInput): Promise<ExecuteCommandResult> {
    const { command, args, cwd, taskId, conversationId } = input

    // 1. 策略检查
    const checkResult = checkCommand(command, args, cwd)
    if (!checkResult.allowed) {
      // 记录拒绝日志
      if (taskId) {
        operationLogRepo.create({
          task_id: taskId,
          conversation_id: conversationId ?? null,
          log_type: 'command_blocked',
          level: 'warn',
          message: `命令被策略拒绝: ${command} ${args.join(' ')}`,
          details: checkResult.reason,
        })
      }

      return {
        ok: false,
        error: checkResult.reason,
        checkResult,
      }
    }

    // 2. 记录执行日志
    if (taskId) {
      operationLogRepo.create({
        task_id: taskId,
        conversation_id: conversationId ?? null,
        log_type: 'command_execute',
        level: 'info',
        message: `执行命令: ${command} ${args.join(' ')}`,
        details: `风险等级: ${checkResult.riskLevel}`,
      })
    }

    // 3. 执行命令
    const runInput: RunCommandInput = {
      command,
      args,
      cwd,
      timeoutMs: input.timeoutMs ?? 60000,
      maxOutputChars: input.maxOutputChars ?? 51200,
      taskId,
    }

    try {
      const session = await runCommand(runInput)

      // 4. 记录完成日志
      if (taskId) {
        operationLogRepo.create({
          task_id: taskId,
          conversation_id: conversationId ?? null,
          log_type: 'command_completed',
          level: session.status === 'completed' ? 'info' : 'warn',
          message: `命令${session.status === 'completed' ? '执行成功' : session.status === 'timeout' ? '超时' : session.status === 'stopped' ? '已停止' : '执行失败'}: ${command}`,
          details: `退出码: ${session.exitCode}, 输出长度: ${session.output.length}${session.truncated ? ' (已截断)' : ''}`,
        })
      }

      return {
        ok: session.status === 'completed',
        session,
      }
    } catch (err: any) {
      if (taskId) {
        operationLogRepo.create({
          task_id: taskId,
          conversation_id: conversationId ?? null,
          log_type: 'command_error',
          level: 'error',
          message: `命令执行异常: ${command}`,
          details: err?.message || '未知错误',
        })
      }

      return {
        ok: false,
        error: err?.message || '命令执行异常',
      }
    }
  }

  /**
   * 停止命令
   */
  async stop(sessionId: string): Promise<void> {
    await stopCommand(sessionId)
  }

  /**
   * 获取命令输出
   */
  getOutput(sessionId: string): CommandOutput | null {
    return getCommandOutput(sessionId)
  }

  /**
   * 获取会话信息
   */
  getSession(sessionId: string): CommandSession | null {
    return getSession(sessionId)
  }

  /**
   * 停止所有命令
   */
  async stopAll(): Promise<void> {
    await stopAllCommands()
  }

  /**
   * 清理会话
   */
  cleanup(sessionId: string): void {
    cleanupSession(sessionId)
  }
}

/** 全局命令服务单例 */
export const commandService = new CommandServiceImpl()

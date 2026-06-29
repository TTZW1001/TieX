/**
 * 命令执行 IPC
 */
import { ipcMain } from 'electron'
import { commandService } from '../services/command.service'
import { CommandSessionRepository, type CommandSessionEntity } from '../database/repositories/command-session.repository'
import { IPC_COMMAND_GET_BY_TASK, IPC_COMMAND_GET_OUTPUT, IPC_COMMAND_STOP } from '../../shared/ipc'

const commandSessionRepo = new CommandSessionRepository()

function parseArgs(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : []
  } catch {
    return []
  }
}

function toCommandSessionInfo(entity: CommandSessionEntity) {
  return {
    sessionId: entity.session_id,
    taskId: entity.task_id,
    command: entity.command,
    args: parseArgs(entity.args),
    status: entity.status,
    exitCode: entity.exit_code,
    output: entity.output,
    truncated: entity.truncated !== 0,
    startedAt: entity.started_at,
    completedAt: entity.completed_at,
  }
}

export function registerCommandIpc(): void {
  // 停止命令
  ipcMain.handle(IPC_COMMAND_STOP, async (_event, sessionId: string) => {
    await commandService.stop(sessionId)
    return { ok: true }
  })

  // 获取命令输出
  ipcMain.handle(IPC_COMMAND_GET_OUTPUT, async (_event, sessionId: string) => {
    return commandService.getOutput(sessionId)
  })

  ipcMain.handle(IPC_COMMAND_GET_BY_TASK, async (_event, taskId: string) => {
    if (!taskId) return []
    return commandSessionRepo.getByTaskId(taskId).map(toCommandSessionInfo)
  })
}

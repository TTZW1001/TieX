/**
 * 任务（Agent）IPC 处理器
 */
import { ipcMain } from 'electron'
import {
  IPC_TASK_START,
  IPC_TASK_STOP,
  IPC_TASK_GET_BY_ID,
  IPC_TASK_GET_BY_CONVERSATION,
  IPC_TASK_GET_STEPS,
  IPC_TASK_GET_TOOL_CALLS,
  IPC_TASK_GET_LOGS,
  IPC_TASK_ROLLBACK,
} from '../../shared/ipc'
import type { CreateTaskRequest } from '../../shared/types'
import { startAgentTask } from '../agent/agent-runtime'
import { taskController } from '../agent/task-controller'
import { TaskRepository } from '../database/repositories/task.repository'
import { TaskStepRepository } from '../database/repositories/task-step.repository'
import { ToolCallRepository } from '../database/repositories/tool-call.repository'
import { OperationLogRepository } from '../database/repositories/operation-log.repository'
import { FileChangeRepository } from '../database/repositories/file-change.repository'
import { BackupService } from '../services/backup.service'
import { WorkspaceRepository } from '../database/repositories/workspace.repository'

const taskRepo = new TaskRepository()
const taskStepRepo = new TaskStepRepository()
const toolCallRepo = new ToolCallRepository()
const operationLogRepo = new OperationLogRepository()
const fileChangeRepo = new FileChangeRepository()
const workspaceRepo = new WorkspaceRepository()
const backupService = new BackupService()

export function registerTaskIpc(): void {
  // 启动任务
  ipcMain.handle(
    IPC_TASK_START,
    async (_event, request: CreateTaskRequest) => {
      if (!request?.conversationId) {
        throw new Error('conversationId 不能为空')
      }
      if (!request?.content || !String(request.content).trim()) {
        throw new Error('任务内容不能为空')
      }
      const taskId = await startAgentTask(request)
      return { taskId }
    }
  )

  // 停止任务
  ipcMain.handle(IPC_TASK_STOP, async (_event, taskId: string) => {
    if (!taskId || typeof taskId !== 'string') {
      throw new Error('taskId 不能为空')
    }
    await taskController.stop(taskId)
    return { ok: true }
  })

  // 获取任务详情
  ipcMain.handle(IPC_TASK_GET_BY_ID, async (_event, taskId: string) => {
    if (!taskId) return null
    const task = taskRepo.getById(taskId)
    return task ? taskController.toTaskInfo(task) : null
  })

  // 获取会话下的任务列表
  ipcMain.handle(
    IPC_TASK_GET_BY_CONVERSATION,
    async (_event, conversationId: string) => {
      if (!conversationId) return []
      const tasks = taskRepo.getByConversationId(conversationId)
      return tasks.map((t) => taskController.toTaskInfo(t))
    }
  )

  // 获取任务步骤
  ipcMain.handle(IPC_TASK_GET_STEPS, async (_event, taskId: string) => {
    if (!taskId) return []
    return taskStepRepo.getByTaskId(taskId)
  })

  // 获取任务工具调用
  ipcMain.handle(IPC_TASK_GET_TOOL_CALLS, async (_event, taskId: string) => {
    if (!taskId) return []
    return toolCallRepo.getByTaskId(taskId)
  })

  // 获取任务操作日志
  ipcMain.handle(IPC_TASK_GET_LOGS, async (_event, taskId: string) => {
    if (!taskId) return []
    return operationLogRepo.getByTaskId(taskId)
  })

  ipcMain.handle(IPC_TASK_ROLLBACK, async (_event, taskId: string) => {
    if (!taskId) {
      throw new Error('taskId 不能为空')
    }

    const task = taskRepo.getById(taskId)
    if (!task) {
      return { success: false, restoredCount: 0, message: '任务不存在' }
    }

    if (!task.workspace_id) {
      return { success: false, restoredCount: 0, message: '任务没有关联工作区，无法回滚' }
    }

    const workspace = workspaceRepo.getById(task.workspace_id)
    if (!workspace) {
      return { success: false, restoredCount: 0, message: '工作区不存在' }
    }

    const changes = fileChangeRepo.getAppliedByTaskId(taskId).slice().reverse()
    let restoredCount = 0

    for (const change of changes) {
      const result = backupService.restoreFile(
        change.task_id,
        workspace.root_path,
        change.relative_path,
        change.after_hash ?? undefined
      )
      if (!result.success) {
        return {
          success: false,
          restoredCount,
          message: result.message || '回滚中断，存在无法恢复的文件',
        }
      }
      fileChangeRepo.markReverted(change.id)
      restoredCount += 1
    }

    return {
      success: true,
      restoredCount,
      message: restoredCount > 0 ? `已回滚 ${restoredCount} 个文件变更` : '这个任务没有可回滚的文件变更',
    }
  })
}

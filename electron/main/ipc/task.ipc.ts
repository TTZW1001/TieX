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
} from '../../shared/ipc'
import type { CreateTaskRequest } from '../../shared/types'
import { startAgentTask } from '../agent/agent-runtime'
import { taskController } from '../agent/task-controller'
import { TaskRepository } from '../database/repositories/task.repository'
import { TaskStepRepository } from '../database/repositories/task-step.repository'
import { ToolCallRepository } from '../database/repositories/tool-call.repository'
import { OperationLogRepository } from '../database/repositories/operation-log.repository'

const taskRepo = new TaskRepository()
const taskStepRepo = new TaskStepRepository()
const toolCallRepo = new ToolCallRepository()
const operationLogRepo = new OperationLogRepository()

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
}

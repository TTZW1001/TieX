/**
 * 文件变更 IPC 处理器
 */
import { ipcMain } from 'electron'
import {
  IPC_FILE_CHANGE_GET_BY_TASK,
  IPC_FILE_CHANGE_RESTORE,
} from '../../shared/ipc'
import { FileChangeRepository } from '../database/repositories/file-change.repository'
import { BackupService } from '../services/backup.service'
import { TaskRepository } from '../database/repositories/task.repository'
import { WorkspaceRepository } from '../database/repositories/workspace.repository'

const fileChangeRepo = new FileChangeRepository()
const taskRepo = new TaskRepository()
const workspaceRepo = new WorkspaceRepository()
const backupService = new BackupService()

export function registerFileChangeIpc(): void {
  // 获取任务下的文件变更列表
  ipcMain.handle(
    IPC_FILE_CHANGE_GET_BY_TASK,
    async (_event, taskId: string) => {
      if (!taskId) return []
      return fileChangeRepo.getByTaskId(taskId)
    }
  )

  // 恢复文件变更
  ipcMain.handle(
    IPC_FILE_CHANGE_RESTORE,
    async (_event, fileChangeId: string) => {
      if (!fileChangeId || typeof fileChangeId !== 'string') {
        throw new Error('fileChangeId 不能为空')
      }

      const change = fileChangeRepo.getById(fileChangeId)
      if (!change) {
        return { success: false, message: '文件变更记录不存在' }
      }

      if (change.status === 'reverted') {
        return { success: false, message: '该变更已被恢复' }
      }

      // 获取任务和工作区信息
      const task = taskRepo.getById(change.task_id)
      if (!task) {
        return { success: false, message: '任务不存在' }
      }

      // 获取工作区根路径
      let workspaceRoot: string | undefined
      if (task.workspace_id) {
        const workspace = workspaceRepo.getById(task.workspace_id)
        if (workspace) {
          workspaceRoot = workspace.root_path
        }
      }

      if (!workspaceRoot) {
        return { success: false, message: '无法确定工作区根路径' }
      }

      // 执行恢复
      const result = backupService.restoreFile(
        change.task_id,
        workspaceRoot,
        change.relative_path,
        change.after_hash ?? undefined
      )

      if (result.success) {
        // 标记变更已恢复
        fileChangeRepo.markReverted(fileChangeId)
      }

      return result
    }
  )
}

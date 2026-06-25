/**
 * 生成物 IPC 处理器
 */
import { ipcMain } from 'electron'
import {
  IPC_ARTIFACT_GET_BY_TASK,
  IPC_ARTIFACT_GET_BY_ID,
  IPC_ARTIFACT_OPEN_FILE,
  IPC_ARTIFACT_OPEN_FOLDER,
  IPC_ARTIFACT_DELETE,
} from '../../shared/ipc'
import { artifactService } from '../services/artifact.service'

export function registerArtifactIpc(): void {
  // 获取任务下的生成物列表
  ipcMain.handle(
    IPC_ARTIFACT_GET_BY_TASK,
    async (_event, taskId: string) => {
      if (!taskId) return []
      return artifactService.getByTaskId(taskId)
    }
  )

  // 获取生成物详情
  ipcMain.handle(
    IPC_ARTIFACT_GET_BY_ID,
    async (_event, artifactId: string) => {
      if (!artifactId) return null
      return artifactService.getById(artifactId)
    }
  )

  // 打开生成文件
  ipcMain.handle(
    IPC_ARTIFACT_OPEN_FILE,
    async (_event, artifactId: string) => {
      if (!artifactId) return false
      return artifactService.openFile(artifactId)
    }
  )

  // 打开所在目录
  ipcMain.handle(
    IPC_ARTIFACT_OPEN_FOLDER,
    async (_event, artifactId: string) => {
      if (!artifactId) return
      await artifactService.openFolder(artifactId)
    }
  )

  // 删除生成物记录（逻辑删除）
  ipcMain.handle(
    IPC_ARTIFACT_DELETE,
    async (_event, artifactId: string) => {
      if (!artifactId) return
      artifactService.delete(artifactId)
    }
  )
}

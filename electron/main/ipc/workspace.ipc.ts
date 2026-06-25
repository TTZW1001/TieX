import { ipcMain, BrowserWindow } from 'electron'
import {
  IPC_WORKSPACE_SELECT,
  IPC_WORKSPACE_LIST,
  IPC_WORKSPACE_GET_BY_ID,
  IPC_WORKSPACE_UPDATE,
  IPC_WORKSPACE_DELETE,
  IPC_WORKSPACE_CHECK_AVAILABLE,
  IPC_WORKSPACE_SWITCH,
} from '../../shared/ipc'
import { WorkspaceService } from '../services/workspace.service'
import type { WorkspaceUpdateInput } from '../../shared/types'

const workspaceService = new WorkspaceService()

export function registerWorkspaceIpc(): void {
  // 打开系统文件夹选择器并保存工作区
  ipcMain.handle(IPC_WORKSPACE_SELECT, async (event) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined
    return workspaceService.selectWorkspace(parentWindow)
  })

  // 获取工作区列表
  ipcMain.handle(IPC_WORKSPACE_LIST, async () => {
    return workspaceService.listWorkspaces()
  })

  // 获取单个工作区
  ipcMain.handle(IPC_WORKSPACE_GET_BY_ID, async (_event, id: string) => {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid workspace id')
    }
    return workspaceService.getWorkspaceById(id)
  })

  // 更新工作区信息
  ipcMain.handle(
    IPC_WORKSPACE_UPDATE,
    async (_event, id: string, data: WorkspaceUpdateInput) => {
      if (!id || typeof id !== 'string') {
        throw new Error('Invalid workspace id')
      }
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid update data')
      }
      return workspaceService.updateWorkspace(id, data)
    }
  )

  // 删除工作区（逻辑删除）
  ipcMain.handle(IPC_WORKSPACE_DELETE, async (_event, id: string) => {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid workspace id')
    }
    workspaceService.deleteWorkspace(id)
  })

  // 检查工作区路径是否可用
  ipcMain.handle(IPC_WORKSPACE_CHECK_AVAILABLE, async (_event, id: string) => {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid workspace id')
    }
    return workspaceService.checkWorkspaceAvailable(id)
  })

  // 切换工作区
  ipcMain.handle(IPC_WORKSPACE_SWITCH, async (_event, id: string) => {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid workspace id')
    }
    return workspaceService.switchWorkspace(id)
  })
}

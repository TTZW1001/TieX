import { ipcMain } from 'electron'
import {
  IPC_FILE_LIST,
  IPC_FILE_READ,
  IPC_FILE_SEARCH,
} from '../../shared/ipc'
import { listFilesTool } from '../tools/list-files.tool'
import { readFileTool } from '../tools/read-file.tool'
import { searchFilesTool } from '../tools/search-files.tool'
import { WorkspaceRepository } from '../database/repositories/workspace.repository'
import type {
  ListFilesInput,
  ReadFileInput,
  SearchFilesInput,
} from '../../shared/types'

const workspaceRepo = new WorkspaceRepository()

/**
 * 获取工作区根路径
 * 校验工作区存在且可用
 */
function getWorkspaceRoot(workspaceId: string): string {
  if (!workspaceId || typeof workspaceId !== 'string') {
    throw new Error('workspaceId 不能为空')
  }
  const workspace = workspaceRepo.getById(workspaceId)
  if (!workspace) {
    throw new Error('工作区不存在')
  }
  if (workspace.is_available !== 1) {
    throw new Error('工作区路径不可用')
  }
  return workspace.root_path
}

export function registerFileToolsIpc(): void {
  // 列出目录内容
  ipcMain.handle(
    IPC_FILE_LIST,
    async (_event, workspaceId: string, input: ListFilesInput) => {
      if (!workspaceId || typeof workspaceId !== 'string') {
        throw new Error('workspaceId 不能为空')
      }
      if (!input || typeof input !== 'object') {
        throw new Error('input 参数无效')
      }
      // path 参数必须为相对路径格式（允许空字符串表示根目录）
      if (input.path !== undefined && input.path !== '' && typeof input.path !== 'string') {
        throw new Error('path 参数必须为字符串')
      }

      const workspaceRoot = getWorkspaceRoot(workspaceId)
      return listFilesTool.execute(workspaceRoot, {
        path: input.path ?? '',
        includeHidden: input.includeHidden,
        maxDepth: input.maxDepth,
      })
    }
  )

  // 读取文件内容
  ipcMain.handle(
    IPC_FILE_READ,
    async (_event, workspaceId: string, input: ReadFileInput) => {
      if (!workspaceId || typeof workspaceId !== 'string') {
        throw new Error('workspaceId 不能为空')
      }
      if (!input || typeof input !== 'object') {
        throw new Error('input 参数无效')
      }
      // path 参数必须非空且为相对路径格式
      if (!input.path || typeof input.path !== 'string' || input.path.trim() === '') {
        throw new Error('path 参数不能为空且必须为相对路径')
      }

      const workspaceRoot = getWorkspaceRoot(workspaceId)
      return readFileTool.execute(workspaceRoot, {
        path: input.path,
        startOffset: input.startOffset,
        maxLength: input.maxLength,
      })
    }
  )

  // 搜索文件内容
  ipcMain.handle(
    IPC_FILE_SEARCH,
    async (_event, workspaceId: string, input: SearchFilesInput) => {
      if (!workspaceId || typeof workspaceId !== 'string') {
        throw new Error('workspaceId 不能为空')
      }
      if (!input || typeof input !== 'object') {
        throw new Error('input 参数无效')
      }
      // pattern 参数必须非空
      if (!input.pattern || typeof input.pattern !== 'string' || input.pattern.trim() === '') {
        throw new Error('pattern 参数不能为空')
      }

      const workspaceRoot = getWorkspaceRoot(workspaceId)
      return searchFilesTool.execute(workspaceRoot, {
        pattern: input.pattern,
        path: input.path,
        filePattern: input.filePattern,
        maxResults: input.maxResults,
        searchContent: input.searchContent,
      })
    }
  )
}

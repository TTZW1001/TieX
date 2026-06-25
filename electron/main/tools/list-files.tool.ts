import { join, relative, extname, basename } from 'path'
import { readdirSync, statSync } from 'fs'
import { pathGuard } from '../security/path-guard'
import {
  type ListFilesInput,
  type ListFilesResult,
  type FileEntry,
  DEFAULT_IGNORED_DIRS,
  MAX_LIST_ENTRIES,
  MAX_LIST_DEPTH,
} from './tool.types'

/**
 * list_files 工具 - 列出工作区指定路径下的文件和子目录
 */
export class ListFilesTool {
  /**
   * 执行 list_files
   */
  execute(workspaceRoot: string, input: ListFilesInput): ListFilesResult {
    const relativePath = input.path ?? ''
    const includeHidden = input.includeHidden ?? false
    const maxDepth = Math.min(input.maxDepth ?? 1, MAX_LIST_DEPTH)

    const targetPath =
      relativePath.trim() === ''
        ? workspaceRoot
        : (() => {
            const validation = pathGuard.validate(workspaceRoot, relativePath)
            if (!validation.allowed) {
              throw new Error(`路径校验失败: ${validation.reason}`)
            }
            return validation.resolvedPath!
          })()
    const entries: FileEntry[] = []

    this.listDirectory(targetPath, workspaceRoot, entries, 0, maxDepth, includeHidden)

    return {
      entries,
      total: entries.length,
    }
  }

  /**
   * 递归列出目录内容
   */
  private listDirectory(
    dirPath: string,
    workspaceRoot: string,
    entries: FileEntry[],
    currentDepth: number,
    maxDepth: number,
    includeHidden: boolean
  ): void {
    if (currentDepth > maxDepth) return
    if (entries.length >= MAX_LIST_ENTRIES) return

    let items: string[]
    try {
      items = readdirSync(dirPath)
    } catch {
      return
    }

    for (const item of items) {
      if (entries.length >= MAX_LIST_ENTRIES) break

      // 跳过隐藏文件（除非明确要求包含）
      if (!includeHidden && item.startsWith('.')) {
        continue
      }

      // 默认忽略 node_modules 和 .git
      if (DEFAULT_IGNORED_DIRS.includes(item)) {
        continue
      }

      const fullPath = join(dirPath, item)
      const relativePath = relative(workspaceRoot, fullPath).replace(/\\/g, '/')

      let stat
      try {
        stat = statSync(fullPath)
      } catch {
        continue
      }

      const isDir = stat.isDirectory()

      entries.push({
        name: item,
        path: relativePath,
        type: isDir ? 'directory' : 'file',
        size: isDir ? 0 : stat.size,
        extension: isDir ? '' : extname(item).toLowerCase(),
        modifiedAt: stat.mtime.toISOString(),
      })

      // 递归处理子目录
      if (isDir && currentDepth < maxDepth) {
        this.listDirectory(
          fullPath,
          workspaceRoot,
          entries,
          currentDepth + 1,
          maxDepth,
          includeHidden
        )
      }
    }
  }
}

/** 默认导出单例 */
export const listFilesTool = new ListFilesTool()

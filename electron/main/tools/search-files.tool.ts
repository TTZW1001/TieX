import { join, relative, basename, extname } from 'path'
import { readdirSync, statSync, openSync, readSync, closeSync } from 'fs'
import { pathGuard } from '../security/path-guard'
import {
  type SearchFilesInput,
  type SearchFilesResult,
  type SearchResult,
  type SearchMatch,
  DEFAULT_IGNORED_DIRS,
  DEFAULT_MAX_SEARCH_RESULTS,
  MAX_SEARCH_RESULTS_LIMIT,
  MAX_MATCHES_PER_FILE,
  MAX_MATCH_LINE_LENGTH,
} from './tool.types'

/**
 * search_files 工具 - 在工作区内搜索匹配指定 pattern 的文件或内容
 */
export class SearchFilesTool {
  /**
   * 执行 search_files
   */
  execute(workspaceRoot: string, input: SearchFilesInput): SearchFilesResult {
    const pattern = input.pattern
    const relativePath = input.path ?? ''
    const filePattern = input.filePattern
    const maxResults = Math.min(
      input.maxResults ?? DEFAULT_MAX_SEARCH_RESULTS,
      MAX_SEARCH_RESULTS_LIMIT
    )
    const searchContent = input.searchContent ?? false

    // PathGuard 校验搜索起始路径
    const validation = pathGuard.validate(workspaceRoot, relativePath)
    if (!validation.allowed) {
      throw new Error(`路径校验失败: ${validation.reason}`)
    }

    const searchRoot = validation.resolvedPath!

    // 编译搜索正则
    let searchRegex: RegExp
    try {
      searchRegex = new RegExp(pattern, 'i')
    } catch {
      // 如果不是有效正则，转义特殊字符作为普通字符串
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      searchRegex = new RegExp(escaped, 'i')
    }

    // 编译文件名匹配模式
    let fileMatcher: ((fileName: string) => boolean) | null = null
    if (filePattern) {
      const globRegex = this.globToRegex(filePattern)
      fileMatcher = (fileName: string) => globRegex.test(fileName)
    }

    const results: SearchResult[] = []
    let truncated = false

    this.searchDirectory(
      searchRoot,
      workspaceRoot,
      searchRegex,
      fileMatcher,
      searchContent,
      results,
      maxResults
    )

    if (results.length >= maxResults) {
      truncated = true
    }

    return {
      results: results.slice(0, maxResults),
      total: results.length,
      truncated,
    }
  }

  /**
   * 递归搜索目录
   */
  private searchDirectory(
    dirPath: string,
    workspaceRoot: string,
    searchRegex: RegExp,
    fileMatcher: ((fileName: string) => boolean) | null,
    searchContent: boolean,
    results: SearchResult[],
    maxResults: number
  ): void {
    if (results.length >= maxResults) return

    let items: string[]
    try {
      items = readdirSync(dirPath)
    } catch {
      return
    }

    for (const item of items) {
      if (results.length >= maxResults) return

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

      if (stat.isDirectory()) {
        // 递归搜索子目录
        this.searchDirectory(
          fullPath,
          workspaceRoot,
          searchRegex,
          fileMatcher,
          searchContent,
          results,
          maxResults
        )
      } else if (stat.isFile()) {
        // 检查文件名是否匹配
        const fileNameMatches = searchRegex.test(item)
        const filePatternMatches = !fileMatcher || fileMatcher(item)

        if (!filePatternMatches) continue

        if (fileNameMatches) {
          // 文件名匹配
          results.push({
            path: relativePath,
            fileName: item,
          })
        } else if (searchContent && pathGuard.isReadableFile(fullPath)) {
          // 搜索文件内容
          const matches = this.searchFileContent(fullPath, searchRegex)
          if (matches.length > 0) {
            results.push({
              path: relativePath,
              fileName: item,
              matches,
            })
          }
        }
      }
    }
  }

  /**
   * 搜索文件内容
   */
  private searchFileContent(filePath: string, searchRegex: RegExp): SearchMatch[] {
    const matches: SearchMatch[] = []
    const maxFileSize = 1024 * 1024 // 内容搜索限制 1MB

    let stat
    try {
      stat = statSync(filePath)
    } catch {
      return matches
    }

    if (stat.size > maxFileSize) return matches

    let content: string
    try {
      const fd = openSync(filePath, 'r')
      try {
        const buffer = Buffer.alloc(stat.size)
        readSync(fd, buffer, 0, stat.size, 0)
        content = buffer.toString('utf-8')
      } finally {
        closeSync(fd)
      }
    } catch {
      return matches
    }

    const lines = content.split('\n')
    for (let i = 0; i < lines.length && matches.length < MAX_MATCHES_PER_FILE; i++) {
      const line = lines[i]
      const match = searchRegex.exec(line)
      if (match) {
        const truncatedContent =
          line.length > MAX_MATCH_LINE_LENGTH
            ? line.substring(0, MAX_MATCH_LINE_LENGTH)
            : line
        matches.push({
          line: i + 1,
          column: match.index + 1,
          content: truncatedContent,
        })
      }
    }

    return matches
  }

  /**
   * 将 glob 模式转换为正则表达式
   * 支持 * 和 ? 通配符
   */
  private globToRegex(glob: string): RegExp {
    let regex = glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
    return new RegExp(`^${regex}$`, 'i')
  }
}

/** 默认导出单例 */
export const searchFilesTool = new SearchFilesTool()

import { readFileSync, statSync } from 'fs'
import { pathGuard } from '../security/path-guard'
import {
  type ReadFileInput,
  type ReadFileResult,
  MAX_READ_SIZE,
  DEFAULT_CHUNK_SIZE,
} from './tool.types'

/**
 * read_file 工具 - 读取工作区内的文本文件内容，支持分段读取
 */
export class ReadFileTool {
  /**
   * 执行 read_file
   */
  execute(workspaceRoot: string, input: ReadFileInput): ReadFileResult {
    const relativePath = input.path
    const startOffset = Math.max(0, input.startOffset ?? 0)
    // 单次最大读取 1MB，默认 64KB
    const maxLength = Math.min(input.maxLength ?? DEFAULT_CHUNK_SIZE, MAX_READ_SIZE)

    // PathGuard 校验
    const validation = pathGuard.validate(workspaceRoot, relativePath)
    if (!validation.allowed) {
      throw new Error(`路径校验失败: ${validation.reason}`)
    }

    const filePath = validation.resolvedPath!

    // 检查是否为文件
    let stat
    try {
      stat = statSync(filePath)
    } catch {
      throw new Error('文件不存在或无法访问')
    }

    if (!stat.isFile()) {
      throw new Error('目标路径不是文件')
    }

    // 检查文件类型是否允许读取（二进制文件拒绝）
    if (!pathGuard.isReadableFile(filePath)) {
      throw new Error('不支持的文件类型（二进制文件或未在白名单中）')
    }

    const totalSize = stat.size

    // 检查文件大小是否在限制内（单次读取限制）
    // 注意：这里不直接拒绝大文件，而是通过分段读取处理
    // 但如果 startOffset 超过文件大小，返回空内容

    // 计算实际读取范围
    const actualStart = Math.min(startOffset, totalSize)
    const actualEnd = Math.min(actualStart + maxLength, totalSize)
    const isTruncated = actualEnd < totalSize

    // 读取文件内容
    let content: string
    try {
      if (actualStart === 0 && actualEnd === totalSize) {
        // 读取整个文件
        content = readFileSync(filePath, 'utf-8')
      } else {
        // 分段读取
        const buffer = Buffer.alloc(actualEnd - actualStart)
        const fd = require('fs').openSync(filePath, 'r')
        try {
          require('fs').readSync(fd, buffer, 0, buffer.length, actualStart)
          content = buffer.toString('utf-8')
        } finally {
          require('fs').closeSync(fd)
        }
      }
    } catch (err) {
      throw new Error(`读取文件失败: ${(err as Error).message}`)
    }

    return {
      content,
      totalSize,
      startOffset: actualStart,
      endOffset: actualEnd,
      isTruncated,
    }
  }
}

/** 默认导出单例 */
export const readFileTool = new ReadFileTool()

/**
 * edit_file Agent 工具 - 修改已有文本文件
 * 基于原文匹配的局部替换
 */
import type { AgentTool, ToolExecutionContext } from './agent-tool.types'
import { pathGuard } from '../security/path-guard'
import { backupService, atomicWriteFile, computeContentHash } from '../services/backup.service'
import { FileChangeRepository } from '../database/repositories/file-change.repository'
import { existsSync, statSync, readFileSync } from 'fs'

const fileChangeRepo = new FileChangeRepository()

/** edit_file 输入 */
export interface EditFileInput {
  path: string
  edits: Array<{
    oldText: string
    newText: string
  }>
}

/** edit_file 输出 */
export interface EditFileOutput {
  path: string
  replacements: number
  beforeHash: string
  afterHash: string
  diffSummary: string
}

/**
 * 生成统一 diff 格式摘要
 */
function generateDiffSummary(
  relativePath: string,
  oldContent: string,
  newContent: string,
  replacements: number
): string {
  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')

  // 简单的 diff 输出
  const lines: string[] = []
  lines.push(`--- a/${relativePath}`)
  lines.push(`+++ b/${relativePath}`)
  lines.push(`@@ 替换 ${replacements} 处 @@`)

  // 找出差异行（简化版本：显示前后各几行）
  const maxContextLines = 3
  let oldIdx = 0
  let newIdx = 0

  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    if (oldIdx < oldLines.length && newIdx < newLines.length && oldLines[oldIdx] === newLines[newIdx]) {
      oldIdx++
      newIdx++
      continue
    }

    // 找到差异区域
    const diffStart = Math.max(0, oldIdx - maxContextLines)
    const contextStart = Math.max(0, diffStart)

    // 添加上下文
    for (let i = contextStart; i < oldIdx; i++) {
      lines.push(` ${oldLines[i]}`)
    }

    // 添加删除行
    let oldEnd = oldIdx
    while (oldEnd < oldLines.length && (newIdx >= newLines.length || oldLines[oldEnd] !== newLines[newIdx])) {
      lines.push(`-${oldLines[oldEnd]}`)
      oldEnd++
    }

    // 添加新增行
    let newEnd = newIdx
    while (newEnd < newLines.length && (oldEnd >= oldLines.length || newLines[newEnd] !== oldLines[oldEnd])) {
      lines.push(`+${newLines[newEnd]}`)
      newEnd++
    }

    oldIdx = oldEnd
    newIdx = newEnd

    // 添加后续上下文
    const contextEnd = Math.min(oldLines.length, oldIdx + maxContextLines)
    for (let i = oldIdx; i < contextEnd; i++) {
      const newLineIdx = i - oldIdx + newIdx
      if (newLineIdx < newLines.length && oldLines[i] === newLines[newLineIdx]) {
        lines.push(` ${oldLines[i]}`)
      }
    }

    // 限制 diff 长度
    if (lines.length > 100) {
      lines.push('... (diff 已截断)')
      break
    }
  }

  return lines.join('\n')
}

/** edit_file Agent 工具 */
export const editFileTool: AgentTool<EditFileInput, EditFileOutput> = {
  name: 'edit_file',
  description:
    '修改工作区内已有的文本文件。基于原文匹配的局部替换，每个编辑操作指定 oldText（必须精确匹配文件内容）和 newText。最多支持 10 个编辑操作。',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '工作区内的相对路径',
      },
      edits: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            oldText: {
              type: 'string',
              description: '原文片段（必须在文件内容中出现）',
            },
            newText: {
              type: 'string',
              description: '替换后的内容',
            },
          },
          required: ['oldText', 'newText'],
          additionalProperties: false,
        },
        minItems: 1,
        maxItems: 10,
        description: '编辑操作列表，最多 10 个',
      },
    },
    required: ['path', 'edits'],
    additionalProperties: false,
  },
  minimumPermission: 'execute',
  riskLevel: 'high',

  validate(input: unknown): EditFileInput {
    const result: EditFileInput = {
      path: String((input as any)?.path ?? ''),
      edits: [],
    }

    const edits = (input as any)?.edits
    if (Array.isArray(edits)) {
      for (const edit of edits) {
        if (typeof edit.oldText === 'string' && typeof edit.newText === 'string') {
          result.edits.push({
            oldText: edit.oldText,
            newText: edit.newText,
          })
        }
      }
    }

    if (result.edits.length === 0) {
      throw new Error('edits 不能为空')
    }

    return result
  },

  async execute(context: ToolExecutionContext, input: EditFileInput): Promise<EditFileOutput> {
    if (!context.workspaceRoot) {
      throw new Error('未设置工作区根路径')
    }

    // 路径安全校验
    const validation = pathGuard.validate(context.workspaceRoot, input.path)
    if (!validation.allowed) {
      throw new Error(`路径校验失败: ${validation.reason}`)
    }

    const absolutePath = validation.resolvedPath!

    // 检查文件类型
    if (!pathGuard.isReadableFile(input.path)) {
      throw new Error('不支持的文件类型，仅允许文本文件')
    }

    // 文件必须存在
    if (!existsSync(absolutePath)) {
      throw new Error(`文件不存在: ${input.path}`)
    }

    // 读取原文件内容
    const originalContent = readFileSync(absolutePath, 'utf-8')
    const beforeHash = computeContentHash(originalContent)
    const beforeSize = Buffer.byteLength(originalContent, 'utf-8')

    // 执行替换
    let currentContent = originalContent
    let totalReplacements = 0

    for (const edit of input.edits) {
      const matchCount = countOccurrences(currentContent, edit.oldText)

      if (matchCount === 0) {
        throw new Error(
          `未找到匹配的原文片段: "${edit.oldText.slice(0, 50)}${edit.oldText.length > 50 ? '...' : ''}"`
        )
      }

      if (matchCount > 1) {
        throw new Error(
          `原文片段匹配到 ${matchCount} 处，请提供更精确的上下文以确保唯一匹配`
        )
      }

      currentContent = currentContent.replace(edit.oldText, edit.newText)
      totalReplacements++
    }

    // 创建备份
    const backupPath = backupService.createBackup(context.taskId, context.workspaceRoot, input.path)

    // 原子写入
    atomicWriteFile(absolutePath, currentContent)

    // 计算修改后的哈希
    const afterHash = computeContentHash(currentContent)
    const afterSize = Buffer.byteLength(currentContent, 'utf-8')

    // 生成 diff 摘要
    const diffSummary = generateDiffSummary(input.path, originalContent, currentContent, totalReplacements)

    // 记录文件变更
    fileChangeRepo.create({
      task_id: context.taskId,
      tool_call_id: context.toolCallId ?? null,
      workspace_id: context.workspaceId ?? null,
      relative_path: input.path,
      operation: 'modify',
      backup_path: backupPath,
      before_hash: beforeHash,
      after_hash: afterHash,
      before_size: beforeSize,
      after_size: afterSize,
      diff_summary: diffSummary,
    })

    return {
      path: input.path,
      replacements: totalReplacements,
      beforeHash,
      afterHash,
      diffSummary,
    }
  },
}

/**
 * 计算子字符串在文本中出现的次数
 */
function countOccurrences(text: string, search: string): number {
  if (!search) return 0
  let count = 0
  let pos = 0
  while ((pos = text.indexOf(search, pos)) !== -1) {
    count++
    pos += search.length
  }
  return count
}

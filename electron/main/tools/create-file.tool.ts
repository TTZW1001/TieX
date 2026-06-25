/**
 * create_file Agent 工具 - 在工作区内创建新文本文件
 */
import type { AgentTool, ToolExecutionContext } from './agent-tool.types'
import { pathGuard } from '../security/path-guard'
import { backupService, atomicWriteFile, computeContentHash } from '../services/backup.service'
import { FileChangeRepository } from '../database/repositories/file-change.repository'
import { existsSync, statSync } from 'fs'
import { dirname } from 'path'

const fileChangeRepo = new FileChangeRepository()

/** create_file 输入 */
export interface CreateFileInput {
  path: string
  content: string
  overwrite?: boolean
}

/** create_file 输出 */
export interface CreateFileOutput {
  path: string
  sizeBytes: number
  created: boolean // true=新建, false=覆盖
}

/** create_file Agent 工具 */
export const createFileTool: AgentTool<CreateFileInput, CreateFileOutput> = {
  name: 'create_file',
  description:
    '在工作区内创建新文本文件。如果目标文件已存在，需要设置 overwrite=true 才能覆盖。写入前会自动创建备份（覆盖时）并记录变更。',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '工作区内的相对路径',
      },
      content: {
        type: 'string',
        description: '文件内容',
      },
      overwrite: {
        type: 'boolean',
        description: '是否允许覆盖已有文件，默认 false',
      },
    },
    required: ['path', 'content'],
    additionalProperties: false,
  },
  minimumPermission: 'execute',
  riskLevel: 'medium',

  validate(input: unknown): CreateFileInput {
    const result: CreateFileInput = {
      path: String((input as any)?.path ?? ''),
      content: String((input as any)?.content ?? ''),
    }
    if (typeof (input as any)?.overwrite === 'boolean') {
      result.overwrite = (input as any).overwrite
    }
    return result
  },

  async execute(context: ToolExecutionContext, input: CreateFileInput): Promise<CreateFileOutput> {
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

    const fileExists = existsSync(absolutePath)

    // 文件已存在但未设置 overwrite
    if (fileExists && !input.overwrite) {
      throw new Error(`文件已存在: ${input.path}。如需覆盖，请设置 overwrite=true`)
    }

    let backupPath: string | null = null
    let beforeHash: string | null = null
    let beforeSize: number | null = null

    // 覆盖时创建备份
    if (fileExists) {
      backupPath = backupService.createBackup(context.taskId, context.workspaceRoot, input.path)
      beforeHash = computeContentHash(
        require('fs').readFileSync(absolutePath, 'utf-8')
      )
      beforeSize = statSync(absolutePath).size
    }

    // 原子写入文件
    atomicWriteFile(absolutePath, input.content)

    // 计算写入后的哈希
    const afterHash = computeContentHash(input.content)
    const afterSize = Buffer.byteLength(input.content, 'utf-8')

    // 生成 diff 摘要
    let diffSummary: string | null = null
    if (fileExists && beforeHash !== afterHash) {
      diffSummary = `--- a/${input.path}\n+++ b/${input.path}\n文件已覆盖，大小从 ${beforeSize} 变为 ${afterSize} 字节`
    } else if (!fileExists) {
      diffSummary = `--- /dev/null\n+++ b/${input.path}\n新文件，${afterSize} 字节`
    }

    // 记录文件变更
    fileChangeRepo.create({
      task_id: context.taskId,
      tool_call_id: context.toolCallId ?? null,
      workspace_id: context.workspaceId ?? null,
      relative_path: input.path,
      operation: fileExists ? 'modify' : 'create',
      backup_path: backupPath,
      before_hash: beforeHash,
      after_hash: afterHash,
      before_size: beforeSize,
      after_size: afterSize,
      diff_summary: diffSummary,
    })

    return {
      path: input.path,
      sizeBytes: afterSize,
      created: !fileExists,
    }
  },
}

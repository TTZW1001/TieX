/**
 * create_markdown Agent 工具 - 在工作区内生成 Markdown 文档
 */
import type { AgentTool, ToolExecutionContext } from './agent-tool.types'
import { pathGuard } from '../security/path-guard'
import { atomicWriteFile, computeContentHash } from '../services/backup.service'
import { artifactService } from '../services/artifact.service'
import { existsSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { app } from 'electron'

/** create_markdown 输入 */
export interface CreateMarkdownInput {
  path: string
  title?: string
  content: string
  overwrite?: boolean
}

/** create_markdown 输出 */
export interface CreateMarkdownOutput {
  path: string
  sizeBytes: number
  created: boolean
  artifactId: string
}

/**
 * 获取生成物的默认目录
 * 有工作区时使用 工作区/.tiex/artifacts/，否则使用 %APPDATA%/TieX/artifacts/
 */
function getArtifactDir(workspaceRoot?: string): string {
  if (workspaceRoot) {
    return join(workspaceRoot, '.tiex', 'artifacts')
  }
  return join(app.getPath('userData'), 'artifacts')
}

/**
 * 校验文件名合法性
 */
function validateFileName(fileName: string): { valid: boolean; reason?: string } {
  if (!fileName || fileName.trim() === '') {
    return { valid: false, reason: '文件名不能为空' }
  }
  // 拒绝 null 字节
  if (fileName.includes('\0')) {
    return { valid: false, reason: '文件名包含非法字符（null 字节）' }
  }
  // 拒绝路径分隔符
  if (/[\\/:]/.test(fileName)) {
    return { valid: false, reason: '文件名不能包含路径分隔符' }
  }
  return { valid: true }
}

/** create_markdown Agent 工具 */
export const createMarkdownTool: AgentTool<CreateMarkdownInput, CreateMarkdownOutput> = {
  name: 'create_markdown',
  description:
    '在工作区内生成 Markdown 文档。文件默认保存到 .tiex/artifacts/ 目录。如果目标文件已存在，需要设置 overwrite=true 才能覆盖。',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '工作区内的相对路径，必须以 .md 结尾',
      },
      title: {
        type: 'string',
        description: '文档标题（可选）',
      },
      content: {
        type: 'string',
        description: 'Markdown 内容',
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

  validate(input: unknown): CreateMarkdownInput {
    const result: CreateMarkdownInput = {
      path: String((input as any)?.path ?? ''),
      content: String((input as any)?.content ?? ''),
    }
    if (typeof (input as any)?.title === 'string') {
      result.title = (input as any).title
    }
    if (typeof (input as any)?.overwrite === 'boolean') {
      result.overwrite = (input as any).overwrite
    }
    return result
  },

  async execute(context: ToolExecutionContext, input: CreateMarkdownInput): Promise<CreateMarkdownOutput> {
    // 校验后缀
    if (!input.path.endsWith('.md')) {
      throw new Error('文件路径必须以 .md 结尾')
    }

    // 校验文件名
    const fileName = input.path.split(/[\\/]/).pop() || ''
    const nameCheck = validateFileName(fileName)
    if (!nameCheck.valid) {
      throw new Error(`文件名校验失败: ${nameCheck.reason}`)
    }

    // 确定实际写入路径
    let absolutePath: string
    let relativePath: string

    if (context.workspaceRoot) {
      // 路径安全校验
      const validation = pathGuard.validate(context.workspaceRoot, input.path)
      if (!validation.allowed) {
        throw new Error(`路径校验失败: ${validation.reason}`)
      }
      absolutePath = validation.resolvedPath!
      relativePath = input.path
    } else {
      // 无工作区时保存到 %APPDATA%/TieX/artifacts/
      const artifactDir = getArtifactDir(undefined)
      absolutePath = join(artifactDir, input.path)
      relativePath = input.path
    }

    const fileExists = existsSync(absolutePath)

    // 文件已存在但未设置 overwrite
    if (fileExists && !input.overwrite) {
      throw new Error(`文件已存在: ${input.path}。如需覆盖，请设置 overwrite=true`)
    }

    // 原子写入文件
    atomicWriteFile(absolutePath, input.content)

    // 计算哈希和大小
    const afterHash = computeContentHash(input.content)
    const afterSize = Buffer.byteLength(input.content, 'utf-8')

    // 记录生成物
    const artifact = artifactService.recordArtifact({
      task_id: context.taskId,
      tool_call_id: context.toolCallId ?? null,
      workspace_id: context.workspaceId ?? null,
      artifact_type: 'markdown',
      name: input.title || fileName,
      relative_path: relativePath,
      absolute_path: absolutePath,
      mime_type: 'text/markdown',
      size_bytes: afterSize,
      file_hash: afterHash,
    })

    return {
      path: relativePath,
      sizeBytes: afterSize,
      created: !fileExists,
      artifactId: artifact.id,
    }
  },
}

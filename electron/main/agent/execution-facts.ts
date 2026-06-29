import type { ToolExecutionResult } from '../tools/agent-tool.types'
import { ArtifactRepository } from '../database/repositories/artifact.repository'
import { FileChangeRepository } from '../database/repositories/file-change.repository'
import { PermissionRequestRepository } from '../database/repositories/permission-request.repository'
import { ToolCallRepository } from '../database/repositories/tool-call.repository'

const fileChangeRepo = new FileChangeRepository()
const artifactRepo = new ArtifactRepository()
const toolCallRepo = new ToolCallRepository()
const permissionRequestRepo = new PermissionRequestRepository()

const WRITE_TOOLS = new Set(['create_file', 'edit_file', 'create_markdown', 'create_docx', 'create_pptx'])
const COMMAND_TOOLS = new Set(['run_command'])

export interface ExecutionFactSummary {
  hasSuccessfulWrite: boolean
  hasSuccessfulCommand: boolean
  hasRejectedPermission: boolean
  hasDeniedPermission: boolean
  successfulWriteTargets: string[]
  successfulCommandTargets: string[]
  rejectedPermissionTargets: string[]
  failedToolSummaries: string[]
  completedToolCount: number
  failedToolCount: number
  pendingToolCount: number
  text: string
}

function parseJson(value: string | null): any {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => !!value)))
}

function describeCommand(result: any, fallbackArgs: any): string {
  const command = result?.command ?? fallbackArgs?.command
  const args = Array.isArray(result?.args)
    ? result.args
    : Array.isArray(fallbackArgs?.args)
      ? fallbackArgs.args
      : []
  return [command, ...args].filter(Boolean).join(' ').trim() || '命令'
}

export function buildExecutionFactSummary(taskId: string): ExecutionFactSummary {
  const fileChanges = fileChangeRepo.getAppliedByTaskId(taskId)
  const artifacts = artifactRepo.getByTaskId(taskId).filter((artifact) => artifact.status === 'created')
  const toolCalls = toolCallRepo.getByTaskId(taskId)
  const permissionRequests = permissionRequestRepo.getByTaskId(taskId)
  const rejectedPermissions = permissionRequests.filter((request) => request.status === 'rejected')

  const successfulWriteTargets = unique([
    ...fileChanges.map((change) => change.relative_path),
    ...artifacts.map((artifact) => artifact.relative_path),
  ])

  const successfulCommandTargets: string[] = []
  const failedToolSummaries: string[] = []
  let completedToolCount = 0
  let failedToolCount = 0
  let pendingToolCount = 0

  for (const toolCall of toolCalls) {
    if (toolCall.status === 'completed') {
      completedToolCount += 1
      if (COMMAND_TOOLS.has(toolCall.tool_name)) {
        const result = parseJson(toolCall.result)
        const args = parseJson(toolCall.arguments)
        successfulCommandTargets.push(describeCommand(result, args))
      }
      continue
    }

    if (toolCall.status === 'failed') {
      failedToolCount += 1
      failedToolSummaries.push(`${toolCall.tool_name}: ${toolCall.error_message || toolCall.error_code || '执行失败'}`)
      continue
    }

    pendingToolCount += 1
  }

  const rejectedPermissionTargets = unique(
    rejectedPermissions.map((request) => request.impact_summary || request.target || request.permission_type)
  )

  const hasSuccessfulWrite =
    successfulWriteTargets.length > 0 ||
    toolCalls.some((toolCall) => toolCall.status === 'completed' && WRITE_TOOLS.has(toolCall.tool_name))

  const hasSuccessfulCommand = successfulCommandTargets.length > 0
  const hasRejectedPermission = rejectedPermissions.length > 0

  const lines = [
    '本轮真实执行事实摘要：',
    `- 成功写入/修改/生成文件：${hasSuccessfulWrite ? successfulWriteTargets.join('、') || '有写入工具成功记录' : '无'}`,
    `- 成功执行命令：${hasSuccessfulCommand ? unique(successfulCommandTargets).join('、') : '无'}`,
    `- 用户拒绝或未批准的权限请求：${hasRejectedPermission ? rejectedPermissionTargets.join('、') : '无'}`,
    `- 失败工具：${failedToolSummaries.length ? failedToolSummaries.join('；') : '无'}`,
    `- 工具统计：completed=${completedToolCount}, failed=${failedToolCount}, pending=${pendingToolCount}`,
  ]

  if (!hasSuccessfulWrite) {
    lines.push('硬约束：没有真实成功写入记录，最终回复不得声称“已经改好、已经写入、已经覆盖更新、已经创建文件”。')
  }
  if (hasRejectedPermission) {
    lines.push('硬约束：存在被拒绝的权限请求，最终回复必须明确对应操作未执行、未修改。')
  }

  return {
    hasSuccessfulWrite,
    hasSuccessfulCommand,
    hasRejectedPermission,
    hasDeniedPermission: hasRejectedPermission,
    successfulWriteTargets,
    successfulCommandTargets: unique(successfulCommandTargets),
    rejectedPermissionTargets,
    failedToolSummaries,
    completedToolCount,
    failedToolCount,
    pendingToolCount,
    text: lines.join('\n'),
  }
}

export function summarizePendingToolFacts(
  pendingToolCalls: Array<{ result: ToolExecutionResult }> | undefined
): string {
  if (!pendingToolCalls?.length) return ''
  const rejected = pendingToolCalls.filter((item) => item.result.error?.code === 'PERMISSION_REJECTED')
  if (!rejected.length) return ''
  return [
    '上一轮工具事实：',
    ...rejected.map((item) => `- ${item.result.tool} 被用户拒绝，未执行，未产生文件或命令效果。`),
  ].join('\n')
}

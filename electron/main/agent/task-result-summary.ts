import { ArtifactRepository } from '../database/repositories/artifact.repository'
import { CommandSessionRepository } from '../database/repositories/command-session.repository'
import { FileChangeRepository } from '../database/repositories/file-change.repository'
import { PermissionRequestRepository } from '../database/repositories/permission-request.repository'
import { TaskStepRepository } from '../database/repositories/task-step.repository'
import { ToolCallRepository } from '../database/repositories/tool-call.repository'
import type { ExecutionFactSummary } from './execution-facts'

const artifactRepo = new ArtifactRepository()
const commandSessionRepo = new CommandSessionRepository()
const fileChangeRepo = new FileChangeRepository()
const permissionRequestRepo = new PermissionRequestRepository()
const taskStepRepo = new TaskStepRepository()
const toolCallRepo = new ToolCallRepository()

export interface StructuredTaskResultSummary {
  result: string
  stats: {
    toolsTotal: number
    toolsFailed: number
    commandsTotal: number
    commandsFailed: number
    fileChangesApplied: number
    artifactsCreated: number
    permissionsPending: number
    permissionsRejected: number
  }
  fileChanges: string[]
  artifacts: string[]
  verification: string[]
  risks: string[]
  createdAt: string
}

function parseJson(value: string | null): any {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function bullet(values: string[], emptyText: string): string[] {
  const items = unique(values)
  return items.length ? items.map((item) => `- ${item}`) : [`- ${emptyText}`]
}

function commandLine(command: string, argsJson: string): string {
  let args: string[] = []
  try {
    const parsed = JSON.parse(argsJson)
    if (Array.isArray(parsed)) {
      args = parsed.map(String)
    }
  } catch {
    args = []
  }
  return [command, ...args.map(quoteArg)].filter(Boolean).join(' ').trim() || '命令'
}

function quoteArg(arg: string): string {
  if (!arg) return '""'
  if (!/[\s"`']/.test(arg)) return arg
  return `"${arg.replace(/(["\\$`])/g, '\\$1')}"`
}

function describeCommandStatus(status: string, exitCode: number | null): string {
  if (status === 'timeout') return '超时'
  if (status === 'stopped') return '已停止'
  if (exitCode !== null && exitCode !== 0) return `退出码 ${exitCode}`
  if (status === 'failed') return '执行失败'
  return status
}

function describeCommandAdvice(status: string, exitCode: number | null): string {
  if (status === 'timeout') return '可能需要检查交互输入、网络访问或执行时间。'
  if (status === 'stopped') return '任务被停止，结果可能不完整。'
  if (exitCode === 127) return '常见原因是命令不存在或不在 PATH 中。'
  if (exitCode === 126) return '常见原因是文件不可执行或权限不足。'
  if (exitCode === 1) return '通常表示命令自身校验失败，建议查看输出末尾。'
  return '建议基于命令输出继续排查。'
}

function outputTail(output: string, maxLength = 220): string {
  const normalized = output.replace(/\r\n/g, '\n').trim()
  if (!normalized) return ''
  const tail = normalized.length > maxLength ? normalized.slice(-maxLength) : normalized
  return tail.replace(/\n+/g, ' / ')
}

function describeFileChange(operation: string, path: string): string {
  if (operation === 'create') return `创建 ${path}`
  if (operation === 'modify') return `修改 ${path}`
  if (operation === 'delete') return `删除 ${path}`
  return `${operation} ${path}`
}

function describeArtifact(type: string, name: string, path: string): string {
  const label =
    type === 'markdown'
      ? 'Markdown'
      : type === 'docx'
        ? 'Word 文档'
        : type === 'pptx'
          ? '演示文稿'
          : type
  return `${label}: ${name}（${path}）`
}

function describeToolFailure(toolName: string, message: string | null, code: string | null): string {
  return `${toolName}: ${message || code || '执行失败'}`
}

export function buildTaskResultSummaryObject(taskId: string, facts: ExecutionFactSummary): StructuredTaskResultSummary {
  const fileChanges = fileChangeRepo.getByTaskId(taskId)
  const appliedFileChanges = fileChanges.filter((change) => change.status === 'applied')
  const artifacts = artifactRepo.getByTaskId(taskId).filter((artifact) => artifact.status === 'created')
  const toolCalls = toolCallRepo.getByTaskId(taskId)
  const permissionRequests = permissionRequestRepo.getByTaskId(taskId)
  const rejectedPermissions = permissionRequests.filter((request) => request.status === 'rejected')
  const pendingPermissions = permissionRequests.filter((request) => request.status === 'pending')
  const commandSessions = commandSessionRepo.getByTaskId(taskId)

  const successfulCommands = commandSessions
    .filter((session) => session.status === 'completed')
    .map((session) => `${commandLine(session.command, session.args)}（退出码 ${session.exit_code ?? '无'}）`)

  const failedCommands = commandSessions
    .filter((session) => session.status === 'failed' || session.status === 'timeout' || session.status === 'stopped')
    .map((session) => {
      const status = describeCommandStatus(session.status, session.exit_code)
      const advice = describeCommandAdvice(session.status, session.exit_code)
      const tail = outputTail(session.output)
      return `${commandLine(session.command, session.args)}（${status}）：${advice}${tail ? ` 输出末尾：${tail}` : ''}`
    })

  const failedTools = toolCalls
    .filter((toolCall) => toolCall.status === 'failed')
    .map((toolCall) => describeToolFailure(toolCall.tool_name, toolCall.error_message, toolCall.error_code))

  const readOnlyTools = toolCalls
    .filter((toolCall) => toolCall.status === 'completed')
    .filter((toolCall) => ['list_files', 'read_file', 'search_files'].includes(toolCall.tool_name))
    .map((toolCall) => {
      const args = parseJson(toolCall.arguments)
      if (toolCall.tool_name === 'read_file') return `读取 ${args?.path || '文件'}`
      if (toolCall.tool_name === 'search_files') return `搜索 ${args?.pattern || '关键词'}`
      if (toolCall.tool_name === 'list_files') return `浏览 ${args?.path || '工作区根目录'}`
      return toolCall.tool_name
    })

  const resultLine =
    facts.hasSuccessfulWrite || artifacts.length > 0
      ? '已完成，并产生了可追踪的文件变更或生成物。'
      : facts.hasSuccessfulCommand
        ? '已完成命令执行，未产生文件写入记录。'
        : failedTools.length || failedCommands.length || rejectedPermissions.length || pendingPermissions.length
          ? '未完整完成，存在失败、拒绝或待处理项。'
          : readOnlyTools.length
            ? '已完成只读分析，未修改文件。'
            : '本轮没有产生可确认的工具执行结果。'

  return {
    result: resultLine,
    stats: {
      toolsTotal: toolCalls.length,
      toolsFailed: failedTools.length,
      commandsTotal: commandSessions.length,
      commandsFailed: failedCommands.length,
      fileChangesApplied: appliedFileChanges.length,
      artifactsCreated: artifacts.length,
      permissionsPending: pendingPermissions.length,
      permissionsRejected: rejectedPermissions.length,
    },
    fileChanges: unique(appliedFileChanges.map((change) => describeFileChange(change.operation, change.relative_path))),
    artifacts: unique(artifacts.map((artifact) => describeArtifact(artifact.artifact_type, artifact.name, artifact.relative_path))),
    verification: unique([
      ...successfulCommands.map((command) => `成功执行 ${command}`),
      ...failedCommands.map((command) => `未成功执行 ${command}`),
      ...readOnlyTools.map((tool) => `完成只读操作：${tool}`),
    ]),
    risks: unique([
      ...failedTools,
      ...failedCommands.map((command) => `命令未成功：${command}`),
      ...rejectedPermissions.map((request) => `权限被拒绝：${request.impact_summary || request.target || request.title}${request.decision_reason ? `（${request.decision_reason}）` : ''}`),
      ...pendingPermissions.map((request) => `权限仍待处理：${request.impact_summary || request.target || request.title}`),
    ]),
    createdAt: new Date().toISOString(),
  }
}

export function renderTaskResultSummary(summary: StructuredTaskResultSummary): string {
  const sections = [
    '**结果**',
    summary.result,
    '',
    '**文件变更**',
    ...bullet(summary.fileChanges, '无文件写入或修改记录'),
    '',
    '**生成物**',
    ...bullet(summary.artifacts, '无生成物'),
    '',
    '**验证与命令**',
    ...bullet(summary.verification, '无命令或只读工具记录'),
    '',
    '**未完成与风险**',
    ...bullet(summary.risks, '未发现失败、拒绝或待处理项'),
  ]

  return sections.join('\n')
}

export function buildTaskResultSummary(taskId: string, facts: ExecutionFactSummary): string {
  return renderTaskResultSummary(buildTaskResultSummaryObject(taskId, facts))
}

export function recordTaskResultSummaryStep(taskId: string, summary: StructuredTaskResultSummary): void {
  const existing = taskStepRepo
    .getByTaskId(taskId)
    .filter((step) => step.step_type === 'task_result_summary')
    .at(-1)
  const content = JSON.stringify(summary)
  if (existing) {
    taskStepRepo.updateContent(existing.id, content)
    taskStepRepo.updateStatus(existing.id, 'completed')
    return
  }
  const step = taskStepRepo.create({
    task_id: taskId,
    sequence_no: taskStepRepo.getNextSequenceNo(taskId),
    step_type: 'task_result_summary',
    content,
  })
  taskStepRepo.updateStatus(step.id, 'completed')
}

export function mergeReplyWithTaskResultSummary(reply: string, summary: string): string {
  const cleanReply = reply.trim()
  const cleanSummary = summary.trim()
  if (!cleanSummary) return cleanReply
  if (!cleanReply) return cleanSummary
  if (cleanReply.includes('**结果**') && cleanReply.includes('**文件变更**')) {
    return cleanReply
  }
  return `${cleanReply}\n\n${cleanSummary}`
}

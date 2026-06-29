/**
 * Tool Executor - 统一工具执行器
 * 负责查找工具、校验参数、权限审批、执行工具、截断结果
 */
import { randomUUID } from 'crypto'
import type {
  AgentTool,
  ToolExecutionContext,
  ToolExecutionResult,
  ModelToolCall,
} from './agent-tool.types'
import { toolRegistry } from './tool-registry'
import { validateToolInput, formatValidationError } from '../security/schema-validator'
import { truncateOutput } from './agent-tools'
import { ToolCallRepository } from '../database/repositories/tool-call.repository'
import { TaskStepRepository } from '../database/repositories/task-step.repository'
import { OperationLogRepository } from '../database/repositories/operation-log.repository'
import { permissionService, type PermissionDecision } from '../services/permission.service'
import { checkPermissionRequired } from '../security/permission-policy'
import { taskEventBus } from '../shared/event-bus'
import type { PermissionMode } from '../../shared/types'

const toolCallRepo = new ToolCallRepository()
const taskStepRepo = new TaskStepRepository()
const operationLogRepo = new OperationLogRepository()

/** 权限等级映射 */
const PERMISSION_RANK: Record<PermissionMode, number> = {
  chat: 0,
  read: 1,
  execute: 2,
  command: 3,
}

function getPermissionTarget(toolName: string, input: unknown): string | undefined {
  const inputObj = typeof input === 'object' && input !== null ? input as any : {}
  if (toolName === 'run_command') {
    const command = String(inputObj.command ?? '').trim()
    const args = Array.isArray(inputObj.args) ? inputObj.args.map((arg: unknown) => String(arg)) : []
    return [command, ...args].filter(Boolean).join(' ').trim() || undefined
  }
  return inputObj.path ? String(inputObj.path) : undefined
}

function getConversationApprovalTarget(toolName: string, input: unknown): string | undefined {
  // “本次会话内允许”对文件写入类工具按工具类型复用，避免同会话 create_file
  // 因为目标路径不同反复打断；命令仍按具体 command+args 复用，避免放开全部命令。
  return toolName === 'run_command' ? getPermissionTarget(toolName, input) : undefined
}

/** 需要权限审批的结果 */
export interface PermissionRequiredResult {
  needsPermission: true
  requestId: string
  toolName: string
  title: string
  reason?: string
  target?: string
  impactSummary?: string
  riskLevel?: string
}

/**
 * 检查工具是否需要权限审批，以及是否已有会话级授权
 */
export function checkToolPermission(
  context: ToolExecutionContext,
  toolName: string,
  input: unknown
): { required: boolean; requestId?: string; reason?: string; riskLevel?: string } {
  const checkResult = checkPermissionRequired(toolName, input)

  if (!checkResult.required) {
    return { required: false }
  }

  // 检查是否已有会话级授权
  const target = getConversationApprovalTarget(toolName, input)
  if (permissionService.hasConversationApproval(context.conversationId, toolName, target)) {
    return { required: false }
  }

  return {
    required: true,
    reason: checkResult.reason,
    riskLevel: checkResult.riskLevel,
  }
}

/**
 * 创建权限请求并推送事件到渲染进程
 */
export function createPermissionRequest(
  context: ToolExecutionContext,
  toolCallId: string,
  toolName: string,
  input: unknown,
  reason?: string,
  riskLevel?: string
): string {
  const inputObj = typeof input === 'object' && input !== null ? input as any : {}
  const target = getPermissionTarget(toolName, input)

  // 构建影响摘要
  let impactSummary: string | undefined
  if (toolName === 'create_file') {
    if (inputObj.overwrite) {
      impactSummary = `将覆盖文件: ${target}`
    } else {
      impactSummary = `将创建新文件: ${target}`
    }
  } else if (toolName === 'edit_file') {
    const editCount = Array.isArray(inputObj.edits) ? inputObj.edits.length : 1
    impactSummary = `将修改文件: ${target}（${editCount} 处替换）`
  } else if (toolName === 'create_markdown') {
    if (inputObj.overwrite) {
      impactSummary = `将覆盖 Markdown 文件: ${target}`
    } else {
      impactSummary = `将生成 Markdown 文档: ${target}`
    }
  } else if (toolName === 'create_docx') {
    if (inputObj.overwrite) {
      impactSummary = `将覆盖 Word 文件: ${target}`
    } else {
      impactSummary = `将生成 Word 文档: ${target}`
    }
  } else if (toolName === 'create_pptx') {
    if (inputObj.overwrite) {
      impactSummary = `将覆盖 PowerPoint 文件: ${target}`
    } else {
      impactSummary = `将生成 PowerPoint 演示文件: ${target}`
    }
  } else if (toolName === 'run_command') {
    const cmd = inputObj.command || ''
    const args = Array.isArray(inputObj.args) ? inputObj.args.join(' ') : ''
    const desc = inputObj.description ? ` (${inputObj.description})` : ''
    impactSummary = `将执行命令: ${cmd} ${args}${desc}`
  }

  // 某些旧数据库 schema 对 permission_requests.tool_call_id 有外键约束，
  // 因此在创建审批记录前，先确保对应的 tool_call 占位记录存在。
  if (!toolCallRepo.getById(toolCallId)) {
    toolCallRepo.create({
      id: toolCallId,
      task_id: context.taskId,
      tool_name: toolName,
      arguments: JSON.stringify(input ?? {}),
    })
  }

  const request = permissionService.requestPermission({
    taskId: context.taskId,
    toolCallId,
    permissionType: toolName,
    title: `请求执行 ${toolName}`,
    reason,
    target,
    impactSummary,
    riskLevel: riskLevel as any,
  })

  // 推送权限请求事件到渲染进程
  taskEventBus.emit({
    type: 'permission:requested',
    taskId: context.taskId,
    requestId: request.id,
    toolName,
    title: request.title,
    reason: request.reason ?? undefined,
    target: request.target ?? undefined,
    impactSummary: request.impact_summary ?? undefined,
    riskLevel: request.risk_level,
  })

  return request.id
}

/**
 * 处理权限决策
 */
export function handlePermissionDecision(
  requestId: string,
  decision: PermissionDecision,
  decisionReason?: string | null,
): void {
  permissionService.handleDecision(requestId, decision, decisionReason)

  const request = permissionService.getRequest(requestId)
  if (request) {
    taskEventBus.emit({
      type: 'permission:decided',
      taskId: request.task_id,
      requestId,
      decision,
      decisionReason: request.decision_reason ?? undefined,
    })
  }
}

/**
 * 执行单个工具调用（不含权限审批逻辑）
 * 权限审批由 Agent Runtime 在调用前处理
 */
export async function executeToolCall(
  context: ToolExecutionContext,
  modelToolCall: ModelToolCall
): Promise<ToolExecutionResult> {
  const startTime = Date.now()
  const toolCallId = context.toolCallId ?? randomUUID()

  // 创建 tool_call 记录（若审批阶段已预创建，则复用）
  if (!toolCallRepo.getById(toolCallId)) {
    const argumentsJson = JSON.stringify(modelToolCall.arguments ?? {})
    toolCallRepo.create({
      id: toolCallId,
      task_id: context.taskId,
      tool_name: modelToolCall.name,
      arguments: argumentsJson,
    })
  }

  // 创建 task_step 记录
  const seqNo = taskStepRepo.getNextSequenceNo(context.taskId)
  const step = taskStepRepo.create({
    task_id: context.taskId,
    sequence_no: seqNo,
    step_type: 'tool_call',
    content: `调用工具: ${modelToolCall.name}`,
  })

  // 关联 step_id
  toolCallRepo.updateStatus(toolCallId, 'running')

  // 查找工具
  const tool: AgentTool | null = toolRegistry.get(modelToolCall.name)
  if (!tool) {
    const errorMsg = `工具 "${modelToolCall.name}" 未注册`
    toolCallRepo.updateError(toolCallId, 'TOOL_NOT_FOUND', errorMsg)
    taskStepRepo.updateStatus(step.id, 'failed')
    operationLogRepo.create({
      task_id: context.taskId,
      conversation_id: context.conversationId,
      log_type: 'tool_error',
      level: 'error',
      message: errorMsg,
      details: JSON.stringify({ toolName: modelToolCall.name }),
    })
    return {
      ok: false,
      tool: modelToolCall.name,
      error: { code: 'TOOL_NOT_FOUND', message: errorMsg },
      durationMs: Date.now() - startTime,
    }
  }

  // Schema 校验
  const validationError = validateToolInput(tool.name, modelToolCall.arguments, tool.schema)
  if (validationError) {
    const errorMsg = formatValidationError(validationError)
    toolCallRepo.updateError(toolCallId, 'TOOL_ARGUMENT_INVALID', errorMsg)
    taskStepRepo.updateStatus(step.id, 'failed')
    operationLogRepo.create({
      task_id: context.taskId,
      conversation_id: context.conversationId,
      log_type: 'tool_validation',
      level: 'warn',
      message: `工具参数校验失败: ${tool.name}`,
      details: errorMsg,
    })
    return {
      ok: false,
      tool: tool.name,
      error: { code: 'TOOL_ARGUMENT_INVALID', message: errorMsg },
      durationMs: Date.now() - startTime,
    }
  }

  // 权限模式校验
  const currentPermissionRank = PERMISSION_RANK[context.permissionMode] ?? 0
  const requiredPermissionRank = PERMISSION_RANK[tool.minimumPermission] ?? 0
  if (currentPermissionRank < requiredPermissionRank) {
    const errorMsg = `当前权限模式 "${context.permissionMode}" 不足以执行工具 "${tool.name}"（需要 "${tool.minimumPermission}"）`
    toolCallRepo.updateError(toolCallId, 'PERMISSION_DENIED', errorMsg)
    taskStepRepo.updateStatus(step.id, 'failed')
    operationLogRepo.create({
      task_id: context.taskId,
      conversation_id: context.conversationId,
      log_type: 'permission',
      level: 'error',
      message: errorMsg,
    })
    return {
      ok: false,
      tool: tool.name,
      error: { code: 'PERMISSION_DENIED', message: errorMsg },
      durationMs: Date.now() - startTime,
    }
  }

  // 执行工具
  try {
    const validatedInput = tool.validate(modelToolCall.arguments)
    const rawResult = await tool.execute(
      {
        ...context,
        toolCallId,
      },
      validatedInput
    )
    const { result, truncated } = truncateOutput(rawResult)
    const resultJson = JSON.stringify(result)

    toolCallRepo.updateResult(toolCallId, resultJson)
    toolCallRepo.updateDuration(toolCallId, Date.now() - startTime)
    taskStepRepo.updateStatus(step.id, 'completed')

    operationLogRepo.create({
      task_id: context.taskId,
      conversation_id: context.conversationId,
      log_type: 'tool_call',
      level: 'info',
      message: `工具执行成功: ${tool.name}`,
      details: truncated ? '结果已截断' : undefined,
    })

    return {
      ok: true,
      tool: tool.name,
      result,
      truncated,
      durationMs: Date.now() - startTime,
    }
  } catch (err: any) {
    const errorCode = 'TOOL_EXECUTION_ERROR'
    const errorMsg = err?.message || '工具执行失败'
    toolCallRepo.updateError(toolCallId, errorCode, errorMsg)
    toolCallRepo.updateDuration(toolCallId, Date.now() - startTime)
    taskStepRepo.updateStatus(step.id, 'failed')

    operationLogRepo.create({
      task_id: context.taskId,
      conversation_id: context.conversationId,
      log_type: 'tool_error',
      level: 'error',
      message: `工具执行失败: ${tool.name}`,
      details: errorMsg,
    })

    return {
      ok: false,
      tool: tool.name,
      error: { code: errorCode, message: errorMsg },
      durationMs: Date.now() - startTime,
    }
  }
}

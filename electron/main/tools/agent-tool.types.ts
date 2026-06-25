/**
 * AgentTool 类型定义
 * 定义 Agent 可调用的工具接口
 */
import type { PermissionMode, ToolRiskLevel } from '../../shared/types'

/** JSON Schema 类型（简化版） */
export interface JSONSchema {
  type?: string
  properties?: Record<string, JSONSchema>
  required?: string[]
  additionalProperties?: boolean
  description?: string
  enum?: unknown[]
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  items?: JSONSchema
}

/** 工具执行上下文 */
export interface ToolExecutionContext {
  taskId: string
  conversationId: string
  workspaceId?: string | null
  workspaceRoot?: string
  toolCallId?: string
  permissionMode: PermissionMode
  signal: AbortSignal
}

/** 工具校验错误 */
export interface ToolValidationError {
  code: 'TOOL_ARGUMENT_INVALID'
  toolName: string
  issues: Array<{
    path: string
    message: string
  }>
}

/** 工具执行结果 */
export interface ToolExecutionResult {
  ok: boolean
  tool: string
  result?: unknown
  error?: {
    code: string
    message: string
  }
  truncated?: boolean
  durationMs?: number
}

/** Agent 工具接口 */
export interface AgentTool<TInput = unknown, TOutput = unknown> {
  name: string
  description: string
  schema: JSONSchema
  minimumPermission: PermissionMode
  riskLevel: ToolRiskLevel

  validate(input: unknown): TInput
  execute(context: ToolExecutionContext, input: TInput): Promise<TOutput>
}

/** 工具定义（发送给模型的格式） */
export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: JSONSchema
  }
}

/** 模型返回的工具调用 */
export interface ModelToolCall {
  id: string
  name: string
  arguments: unknown
}

export interface ModelProvider {
  id: string
  name: string
  provider_type: string
  base_url: string
  model_name: string
  encrypted_api_key: Buffer | null
  temperature: number | null
  max_tokens: number | null
  timeout_ms: number
  stream_enabled: number
  is_default: number
  is_enabled: number
  is_deleted: number
  created_at: string
  updated_at: string
}

export interface Conversation {
  id: string
  title: string
  provider_id: string | null
  workspace_id: string | null
  parent_conversation_id?: string | null
  branch_from_message_id?: string | null
  permission_mode: string
  status: string
  is_pinned: number
  last_message_at: string | null
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  conversation_id: string
  task_id: string | null
  role: string
  content: string
  content_type: string
  tool_call_id: string | null
  sequence_no: number
  token_count: number | null
  is_streaming: number
  created_at: string
  updated_at: string
}

export interface MessageAttachment {
  id: string
  message_id: string
  conversation_id: string
  kind: 'image' | 'file'
  file_name: string
  mime_type: string | null
  original_path: string
  size_bytes: number | null
  created_at: string
}

export interface CreateConversationInput {
  title?: string
  provider_id?: string
  workspace_id?: string
  parent_conversation_id?: string | null
  branch_from_message_id?: string | null
  permission_mode?: string
}

export interface CreateMessageInput {
  conversation_id: string
  task_id?: string
  role: string
  content: string
  content_type?: string
  tool_call_id?: string
  sequence_no: number
  token_count?: number
}

export interface CreateMessageAttachmentInput {
  message_id: string
  conversation_id: string
  kind: 'image' | 'file'
  file_name: string
  mime_type?: string | null
  original_path: string
  size_bytes?: number | null
}

export interface AppSetting {
  key: string
  value: string
  value_type: string
  updated_at: string
}

// 聊天相关类型

export interface ChatMessageVO {
  id: string
  conversationId: string
  taskId: string | null
  role: string
  content: string
  contentType: string
  attachments?: MessageAttachmentVO[]
  sequenceNo: number
  isStreaming: number
  createdAt: string
}

export interface MessageAttachmentVO {
  id: string
  kind: 'image' | 'file'
  fileName: string
  mimeType: string | null
  originalPath: string
  sizeBytes: number | null
}

export interface AttachmentInput {
  path: string
  name: string
  mimeType?: string | null
  size?: number | null
}

export interface ChatSendInput {
  conversationId: string
  content: string
  attachments?: AttachmentInput[]
}

export interface ChatDeltaEvent {
  messageId: string
  content: string
  delta: string
}

export interface ChatDoneEvent {
  messageId: string
}

export interface ChatErrorEvent {
  messageId: string
  error: {
    code: string
    message: string
  }
}

// 工作区相关类型

export interface WorkspaceVO {
  id: string
  name: string
  rootPath: string
  normalizedPath: string
  defaultPermissionMode: string
  isFavorite: boolean
  isAvailable: boolean
  lastOpenedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface WorkspaceUpdateInput {
  name?: string
  isFavorite?: boolean
}

// 文件工具相关类型

export interface ListFilesInput {
  path: string
  includeHidden?: boolean
  maxDepth?: number
}

export interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
  extension: string
  modifiedAt: string
}

export interface ListFilesResult {
  entries: FileEntry[]
  total: number
}

export interface ReadFileInput {
  path: string
  startOffset?: number
  maxLength?: number
}

export interface ReadFileResult {
  content: string
  totalSize: number
  startOffset: number
  endOffset: number
  isTruncated: boolean
}

export interface SearchFilesInput {
  pattern: string
  path?: string
  filePattern?: string
  maxResults?: number
  searchContent?: boolean
}

export interface SearchMatch {
  line: number
  column: number
  content: string
}

export interface SearchResult {
  path: string
  fileName: string
  matches?: SearchMatch[]
}

export interface SearchFilesResult {
  results: SearchResult[]
  total: number
  truncated: boolean
}

// ===== Agent 与任务相关类型 =====

/** 权限模式 */
export type PermissionMode = 'chat' | 'read' | 'execute' | 'command'

/** 任务状态 */
export type TaskStatus =
  | 'pending'
  | 'running'
  | 'waiting_permission'
  | 'executing_tool'
  | 'completed'
  | 'failed'
  | 'stopped'
  | 'interrupted'

/** 工具风险等级 */
export type ToolRiskLevel = 'low' | 'medium' | 'high' | 'blocked'

/** 任务实体（数据库行） */
export interface TaskEntity {
  id: string
  conversation_id: string
  user_message_id: string | null
  assistant_message_id: string | null
  provider_id: string
  workspace_id: string | null
  permission_mode: string
  status: string
  title: string | null
  error_code: string | null
  error_message: string | null
  round_count: number
  tool_call_count: number
  failure_count: number
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

/** 创建任务输入 */
export interface CreateTaskInput {
  id: string
  conversation_id: string
  user_message_id?: string | null
  provider_id: string
  workspace_id?: string | null
  permission_mode?: string
  title?: string | null
}

/** 任务步骤实体 */
export interface TaskStepEntity {
  id: string
  task_id: string
  sequence_no: number
  step_type: string // 'model_request' | 'tool_call' | 'permission' | 'text_response'
  status: string
  content: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

/** 创建步骤输入 */
export interface CreateTaskStepInput {
  id: string
  task_id: string
  sequence_no: number
  step_type: string
  content?: string | null
}

/** 工具调用实体 */
export interface ToolCallEntity {
  id: string
  task_id: string
  step_id: string | null
  tool_name: string
  arguments: string
  status: string
  result: string | null
  error_code: string | null
  error_message: string | null
  duration_ms: number | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

/** 创建工具调用输入 */
export interface CreateToolCallInput {
  id: string
  task_id: string
  step_id?: string | null
  tool_name: string
  arguments: string
}

/** 操作日志实体 */
export interface OperationLogEntity {
  id: string
  task_id: string
  conversation_id: string | null
  log_type: string
  level: string
  message: string
  details: string | null
  created_at: string
}

/** 创建操作日志输入 */
export interface CreateOperationLogInput {
  id: string
  task_id: string
  conversation_id?: string | null
  log_type: string
  level?: string
  message: string
  details?: string | null
}

/** 任务信息（前端使用） */
export interface TaskInfo {
  id: string
  conversationId: string
  userMessageId: string | null
  assistantMessageId: string | null
  providerId: string
  workspaceId: string | null
  permissionMode: string
  status: TaskStatus
  title: string | null
  errorCode: string | null
  errorMessage: string | null
  roundCount: number
  toolCallCount: number
  failureCount: number
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

/** 任务步骤信息（前端使用） */
export interface TaskStepInfo {
  id: string
  taskId: string
  sequenceNo: number
  stepType: string
  status: string
  content: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}

/** 工具调用信息（前端使用） */
export interface ToolCallInfo {
  id: string
  taskId: string
  stepId: string | null
  toolName: string
  arguments: string
  status: string
  result: string | null
  errorCode: string | null
  errorMessage: string | null
  durationMs: number | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}

/** 操作日志信息（前端使用） */
export interface OperationLogInfo {
  id: string
  taskId: string
  conversationId: string | null
  logType: string
  level: string
  message: string
  details: string | null
  createdAt: string
}

/** 任务详情（含步骤、工具调用、日志） */
export interface TaskDetail extends TaskInfo {
  steps: TaskStepInfo[]
  toolCalls: ToolCallInfo[]
  logs: OperationLogInfo[]
}

/** 创建任务请求（前端→主进程） */
export interface CreateTaskRequest {
  conversationId: string
  content: string
  attachments?: AttachmentInput[]
  workspaceId?: string | null
  title?: string | null
}

export interface WorkspaceMemory {
  workspace_id: string
  content: string
  updated_at: string
}

export interface MemoryCandidate {
  id: string
  scope: 'global' | 'workspace'
  category: 'preference' | 'identity' | 'workspace_rule'
  candidate_text: string
  source_message_id: string | null
  workspace_id: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  decided_at: string | null
}

export interface ConversationSummary {
  conversation_id: string
  summary: string
  message_count: number
  updated_at: string
}

export type AgentRole = 'responder' | 'implementation' | 'research' | 'memory'

export interface TokenPoint {
  bucket: string
  tokens: number
}

export interface ModelUsageShare {
  provider_id: string | null
  provider_name: string
  model_name: string
  tokens: number
  message_count: number
  percentage: number
}

export interface ConversationDetailStats {
  conversation_id: string
  title: string
  workspace_id: string | null
  workspace_name: string | null
  message_count: number
  task_count: number
  total_tokens: number
  first_message_at: string | null
  last_message_at: string | null
  summary: string
  model_usage: ModelUsageShare[]
  token_series: {
    hour: TokenPoint[]
    day: TokenPoint[]
    week: TokenPoint[]
    month: TokenPoint[]
  }
}

export interface StatsOverview {
  workspace_count: number
  conversation_count: number
  total_tokens: number
  assistant_message_count: number
  active_provider_count: number
  model_usage: ModelUsageShare[]
  token_series: {
    hour: TokenPoint[]
    day: TokenPoint[]
    week: TokenPoint[]
    month: TokenPoint[]
  }
}

/** 任务事件（主进程→渲染进程） */
export type TaskEvent =
  | { type: 'task:started'; taskId: string }
  | { type: 'task:statusChanged'; taskId: string; status: TaskStatus }
  | { type: 'tool:started'; taskId: string; toolCallId: string; toolName: string }
  | { type: 'tool:completed'; taskId: string; toolCallId: string; result: unknown }
  | { type: 'tool:failed'; taskId: string; toolCallId: string; error: string }
  | { type: 'message:delta'; taskId: string; messageId: string; content: string; delta: string }
  | { type: 'task:completed'; taskId: string }
  | { type: 'task:failed'; taskId: string; error: string }
  | { type: 'task:stopped'; taskId: string }
  | { type: 'permission:requested'; taskId: string; requestId: string; toolName: string; title: string; reason?: string; target?: string; impactSummary?: string; riskLevel?: string }
  | { type: 'permission:decided'; taskId: string; requestId: string; decision: string; decisionReason?: string }
  | { type: 'artifact:created'; taskId: string; artifactId: string; artifactType: string; name: string }
  | { type: 'command:started'; taskId: string; sessionId: string; command: string; args: string[] }
  | { type: 'command:output'; taskId: string; sessionId: string; output: string; truncated: boolean }
  | { type: 'command:completed'; taskId: string; sessionId: string; exitCode: number | null; output: string }
  | { type: 'command:failed'; taskId: string; sessionId: string; error: string }
  | { type: 'command:stopped'; taskId: string; sessionId: string }
  | { type: 'command:timeout'; taskId: string; sessionId: string }

// ===== 权限审批相关类型 =====

/** 权限请求信息（前端使用） */
export interface PermissionRequestInfo {
  id: string
  taskId: string
  toolCallId: string
  permissionType: string
  title: string
  reason: string | null
  target: string | null
  impactSummary: string | null
  riskLevel: string
  status: string
  decisionScope: string | null
  decisionReason: string | null
  requestedAt: string
  decidedAt: string | null
}

/** 权限决策类型 */
export type PermissionDecision = 'approved_once' | 'approved_for_conversation' | 'rejected'

// ===== 文件变更相关类型 =====

/** 文件变更信息（前端使用） */
export interface FileChangeInfo {
  id: string
  taskId: string
  toolCallId: string | null
  workspaceId: string | null
  relativePath: string
  operation: string
  backupPath: string | null
  beforeHash: string | null
  afterHash: string | null
  beforeSize: number | null
  afterSize: number | null
  diffSummary: string | null
  status: string
  changedAt: string
  revertedAt: string | null
}

// ===== 生成物相关类型 =====

/** 生成物信息（前端使用） */
export interface ArtifactInfo {
  id: string
  taskId: string
  toolCallId: string | null
  workspaceId: string | null
  artifactType: string
  name: string
  relativePath: string
  absolutePath: string
  mimeType: string | null
  sizeBytes: number
  fileHash: string | null
  status: string
  createdAt: string
}

// ===== 命令执行相关类型 =====

/** 命令会话信息（前端使用） */
export interface CommandSessionInfo {
  sessionId: string
  taskId?: string | null
  command: string
  args: string[]
  status: 'running' | 'completed' | 'failed' | 'stopped' | 'timeout'
  exitCode: number | null
  output: string
  truncated: boolean
  startedAt: string
  completedAt: string | null
}

/** 命令输出信息 */
export interface CommandOutputInfo {
  output: string
  truncated: boolean
  exitCode: number | null
}

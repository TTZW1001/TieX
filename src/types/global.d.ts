export interface ProviderInfo {
  id: string
  name: string
  provider_type: string
  base_url: string
  model_name: string
  encrypted_api_key: null
  has_api_key: boolean
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

export interface ConversationInfo {
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

export interface ChatMessageInfo {
  id: string
  conversationId: string
  taskId: string | null
  role: string
  content: string
  contentType: string
  attachments?: MessageAttachmentInfo[]
  sequenceNo: number
  isStreaming: number
  createdAt: string
}

export interface MessageAttachmentInfo {
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

export interface ChatDeltaData {
  messageId: string
  content: string
  delta: string
}

export interface ChatDoneData {
  messageId: string
}

export interface ChatErrorData {
  messageId: string
  error: {
    code: string
    message: string
  }
}

// 工作区相关类型
export interface WorkspaceInfo {
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

export interface WorkspaceMemoryInfo {
  workspace_id: string
  content: string
  updated_at: string
}

export interface MemoryCandidateInfo {
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

export interface ConversationSummaryInfo {
  conversation_id: string
  summary: string
  message_count: number
  updated_at: string
}

export interface TokenPointInfo {
  bucket: string
  tokens: number
}

export interface ModelUsageShareInfo {
  provider_id: string | null
  provider_name: string
  model_name: string
  tokens: number
  message_count: number
  percentage: number
}

export interface ConversationDetailStatsInfo {
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
  model_usage: ModelUsageShareInfo[]
  token_series: {
    hour: TokenPointInfo[]
    day: TokenPointInfo[]
    week: TokenPointInfo[]
    month: TokenPointInfo[]
  }
}

export interface StatsOverviewInfo {
  workspace_count: number
  conversation_count: number
  total_tokens: number
  assistant_message_count: number
  active_provider_count: number
  model_usage: ModelUsageShareInfo[]
  token_series: {
    hour: TokenPointInfo[]
    day: TokenPointInfo[]
    week: TokenPointInfo[]
    month: TokenPointInfo[]
  }
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

// 任务（Agent）相关类型
export interface CreateTaskRequest {
  conversationId: string
  content: string
  attachments?: AttachmentInput[]
  workspaceId?: string | null
  title?: string | null
}

export interface TaskInfo {
  id: string
  conversationId: string
  userMessageId: string | null
  providerId: string
  workspaceId: string | null
  permissionMode: string
  status: string
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

export interface TaskStepEntity {
  id: string
  task_id: string
  sequence_no: number
  step_type: string
  content: string
  status: string
  started_at: string | null
  completed_at: string | null
  duration_ms: number | null
  created_at: string
}

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

export interface OperationLogEntity {
  id: string
  task_id: string
  conversation_id: string
  log_type: string
  level: string
  message: string
  details: string | null
  created_at: string
}

export interface TaskEvent {
  type:
    | 'task:started'
    | 'task:statusChanged'
    | 'tool:started'
    | 'tool:completed'
    | 'tool:failed'
    | 'message:delta'
    | 'task:completed'
    | 'task:failed'
    | 'task:stopped'
    | 'permission:requested'
    | 'permission:decided'
    | 'artifact:created'
    | 'command:started'
    | 'command:output'
    | 'command:completed'
    | 'command:failed'
    | 'command:stopped'
    | 'command:timeout'
  taskId: string
  messageId?: string
  status?: string
  toolCallId?: string
  toolName?: string
  result?: unknown
  error?: string
  content?: string
  delta?: string
  // 权限审批相关
  requestId?: string
  title?: string
  reason?: string
  target?: string
  impactSummary?: string
  riskLevel?: string
  decision?: string
  // 生成物相关
  artifactId?: string
  artifactType?: string
  name?: string
  // 命令执行相关
  sessionId?: string
  command?: string
  args?: string[]
  exitCode?: number | null
  output?: string
  truncated?: boolean
}

// 权限审批相关类型
export interface PermissionRequestInfo {
  id: string
  task_id: string
  tool_call_id: string
  permission_type: string
  title: string
  reason: string | null
  target: string | null
  impact_summary: string | null
  risk_level: string
  status: string
  decision_scope: string | null
  requested_at: string
  decided_at: string | null
}

export type PermissionDecision = 'approved_once' | 'approved_for_task' | 'rejected'

// 文件变更相关类型
export interface FileChangeInfo {
  id: string
  task_id: string
  tool_call_id: string | null
  workspace_id: string | null
  relative_path: string
  operation: string
  backup_path: string | null
  before_hash: string | null
  after_hash: string | null
  before_size: number | null
  after_size: number | null
  diff_summary: string | null
  status: string
  changed_at: string
  reverted_at: string | null
}

// 生成物相关类型
export interface ArtifactInfo {
  id: string
  task_id: string
  tool_call_id: string | null
  workspace_id: string | null
  artifact_type: string
  name: string
  relative_path: string
  absolute_path: string
  mime_type: string | null
  size_bytes: number
  file_hash: string | null
  status: string
  created_at: string
}

// 命令执行相关类型
export interface CommandSessionInfo {
  sessionId: string
  command: string
  args: string[]
  status: 'running' | 'completed' | 'failed' | 'stopped' | 'timeout'
  exitCode: number | null
  output: string
  truncated: boolean
  startedAt: string
  completedAt: string | null
}

export interface CommandOutputInfo {
  output: string
  truncated: boolean
  exitCode: number | null
}

export interface TieXDesktopAPI {
  window: {
    minimize: () => void
    maximize: () => void
    close: () => void
  }
  theme: {
    getSystem: () => Promise<boolean>
    set: (theme: 'light' | 'dark' | 'system') => void
    onChanged: (callback: (isDark: boolean) => void) => () => void
  }
  settings: {
    get: (key: string) => Promise<string | null>
    getAll: () => Promise<Record<string, string>>
    getDataDirectory: () => Promise<string>
    update: (key: string, value: string) => Promise<void>
  }
  provider: {
    getDefault: () => Promise<ProviderInfo | null>
    list: () => Promise<ProviderInfo[]>
    getById: (id: string) => Promise<ProviderInfo | null>
    create: (data: Record<string, unknown>) => Promise<ProviderInfo>
    update: (id: string, data: Record<string, unknown>) => Promise<void>
    delete: (id: string) => Promise<void>
    testConnection: (id: string) => Promise<{ success: boolean; message: string }>
    testDraft: (data: Record<string, unknown>) => Promise<{ success: boolean; message: string }>
  }
  conversation: {
    create: (data?: Record<string, unknown>) => Promise<ConversationInfo>
    getRecent: (limit?: number) => Promise<ConversationInfo[]>
    getById: (id: string) => Promise<ConversationInfo | null>
    updateTitle: (id: string, title: string) => Promise<void>
    updateProvider: (id: string, providerId: string | null) => Promise<void>
    branchFromMessage: (conversationId: string, messageId: string) => Promise<ConversationInfo>
    delete: (id: string) => Promise<{ ok: boolean; error?: string }>
  }
  chat: {
    send: (conversationId: string, content: string, attachments?: AttachmentInput[]) => Promise<ChatMessageInfo>
    stop: (conversationId: string) => Promise<void>
    getMessages: (conversationId: string) => Promise<ChatMessageInfo[]>
    countMessages: (conversationId: string) => Promise<number>
    getMessagesPaged: (conversationId: string, limit: number, offset: number) => Promise<ChatMessageInfo[]>
    onDelta: (callback: (data: ChatDeltaData) => void) => () => void
    onDone: (callback: (data: ChatDoneData) => void) => () => void
    onError: (callback: (data: ChatErrorData) => void) => () => void
  }
  workspace: {
    select: () => Promise<WorkspaceInfo | null>
    list: () => Promise<WorkspaceInfo[]>
    getById: (id: string) => Promise<WorkspaceInfo | null>
    update: (id: string, data: WorkspaceUpdateInput) => Promise<WorkspaceInfo | null>
    delete: (id: string) => Promise<void>
    checkAvailable: (id: string) => Promise<boolean>
    switch: (id: string) => Promise<WorkspaceInfo>
  }
  memory: {
    getGlobal: () => Promise<string>
    setGlobal: (content: string) => Promise<void>
    getWorkspace: (workspaceId: string) => Promise<WorkspaceMemoryInfo | null>
    setWorkspace: (workspaceId: string, content: string) => Promise<void>
    getCandidates: (status?: 'pending' | 'approved' | 'rejected') => Promise<MemoryCandidateInfo[]>
    approveCandidate: (candidateId: string) => Promise<void>
    rejectCandidate: (candidateId: string) => Promise<void>
    getConversationSummary: (conversationId: string) => Promise<ConversationSummaryInfo | null>
  }
  file: {
    list: (workspaceId: string, input: ListFilesInput) => Promise<ListFilesResult>
    read: (workspaceId: string, input: ReadFileInput) => Promise<ReadFileResult>
    search: (workspaceId: string, input: SearchFilesInput) => Promise<SearchFilesResult>
  }
  task: {
    start: (request: CreateTaskRequest) => Promise<{ taskId: string }>
    stop: (taskId: string) => Promise<{ ok: boolean }>
    getById: (taskId: string) => Promise<TaskInfo | null>
    getByConversation: (conversationId: string) => Promise<TaskInfo[]>
    getSteps: (taskId: string) => Promise<TaskStepEntity[]>
    getToolCalls: (taskId: string) => Promise<ToolCallEntity[]>
    getLogs: (taskId: string) => Promise<OperationLogEntity[]>
    rollback: (taskId: string) => Promise<{ success: boolean; restoredCount: number; message?: string }>
    onEvent: (callback: (event: TaskEvent) => void) => () => void
  }
  permission: {
    decide: (requestId: string, decision: PermissionDecision) => Promise<void>
    getRequest: (requestId: string) => Promise<PermissionRequestInfo | null>
    getByTask: (taskId: string) => Promise<PermissionRequestInfo[]>
  }
  fileChange: {
    getByTask: (taskId: string) => Promise<FileChangeInfo[]>
    restore: (fileChangeId: string) => Promise<{ success: boolean; conflict?: boolean; message?: string }>
  }
  artifact: {
    getByTask: (taskId: string) => Promise<ArtifactInfo[]>
    getById: (artifactId: string) => Promise<ArtifactInfo | null>
    openFile: (artifactId: string) => Promise<boolean>
    openFolder: (artifactId: string) => Promise<void>
    delete: (artifactId: string) => Promise<void>
  }
  command: {
    stop: (sessionId: string) => Promise<{ ok: boolean }>
    getOutput: (sessionId: string) => Promise<CommandOutputInfo | null>
  }
  shell: {
    openExternal: (url: string) => Promise<{ ok: boolean; error?: string }>
    openPath: (filePath: string) => Promise<{ ok: boolean; error?: string }>
    showInFolder: (filePath: string) => Promise<{ ok: boolean; error?: string }>
  }
  stats: {
    getOverview: () => Promise<StatsOverviewInfo>
    getConversationDetail: (conversationId: string) => Promise<ConversationDetailStatsInfo | null>
  }
}

declare global {
  interface Window {
    tiex: TieXDesktopAPI
  }
}

export {}

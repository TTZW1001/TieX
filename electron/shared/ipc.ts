// IPC 频道常量

// 设置相关
export const IPC_SETTINGS_GET = 'settings:get'
export const IPC_SETTINGS_GET_ALL = 'settings:getAll'
export const IPC_SETTINGS_UPDATE = 'settings:update'
export const IPC_SETTINGS_GET_DATA_DIRECTORY = 'settings:getDataDirectory'

// AI 配置相关
export const IPC_AI_SETTINGS_GET_DEFAULT = 'aiSettings:getDefault'
export const IPC_AI_SETTINGS_UPDATE_DEFAULT = 'aiSettings:updateDefault'
export const IPC_AI_SETTINGS_GET_CONVERSATION = 'aiSettings:getConversation'
export const IPC_AI_SETTINGS_UPDATE_CONVERSATION = 'aiSettings:updateConversation'
export const IPC_AI_SETTINGS_RESET_CONVERSATION = 'aiSettings:resetConversation'
export const IPC_AI_SETTINGS_GET_EFFECTIVE = 'aiSettings:getEffective'

// Skills 相关
export const IPC_SKILLS_LIST = 'skills:list'
export const IPC_SKILLS_SCAN = 'skills:scan'
export const IPC_SKILLS_SET_ENABLED = 'skills:setEnabled'
export const IPC_SKILLS_DELETE = 'skills:delete'
export const IPC_SKILLS_GET_MARKET = 'skills:getMarket'
export const IPC_SKILLS_INSTALL_MARKET = 'skills:installMarket'
export const IPC_SKILLS_IMPORT_CODEX = 'skills:importCodex'
export const IPC_SKILLS_OPEN_FOLDER = 'skills:openFolder'
export const IPC_SKILLS_RESOLVE_REFS = 'skills:resolveRefs'

// 提供者相关
export const IPC_PROVIDER_GET_DEFAULT = 'provider:getDefault'
export const IPC_PROVIDER_LIST = 'provider:list'
export const IPC_PROVIDER_GET_BY_ID = 'provider:getById'
export const IPC_PROVIDER_CREATE = 'provider:create'
export const IPC_PROVIDER_UPDATE = 'provider:update'
export const IPC_PROVIDER_DELETE = 'provider:delete'
export const IPC_PROVIDER_TEST_CONNECTION = 'provider:testConnection'
export const IPC_PROVIDER_TEST_DRAFT = 'provider:testDraft'

// 会话相关
export const IPC_CONVERSATION_CREATE = 'conversation:create'
export const IPC_CONVERSATION_GET_RECENT = 'conversation:getRecent'
export const IPC_CONVERSATION_GET_BY_ID = 'conversation:getById'
export const IPC_CONVERSATION_UPDATE_TITLE = 'conversation:updateTitle'
export const IPC_CONVERSATION_UPDATE_PROVIDER = 'conversation:updateProvider'
export const IPC_CONVERSATION_UPDATE_WORKSPACE = 'conversation:updateWorkspace'
export const IPC_CONVERSATION_UPDATE_PERMISSION_MODE = 'conversation:updatePermissionMode'
export const IPC_CONVERSATION_BRANCH_FROM_MESSAGE = 'conversation:branchFromMessage'
export const IPC_CONVERSATION_DELETE = 'conversation:delete'

// 聊天相关
export const IPC_CHAT_SEND = 'chat:send'
export const IPC_CHAT_STOP = 'chat:stop'
export const IPC_CHAT_GET_MESSAGES = 'chat:getMessages'
export const IPC_CHAT_GET_MESSAGES_PAGED = 'chat:getMessagesPaged'
export const IPC_CHAT_COUNT_MESSAGES = 'chat:countMessages'

// 聊天事件（主进程→渲染进程）
export const IPC_CHAT_DELTA = 'chat:delta'
export const IPC_CHAT_DONE = 'chat:done'
export const IPC_CHAT_ERROR = 'chat:error'

// 工作区相关
export const IPC_WORKSPACE_SELECT = 'workspace:select'
export const IPC_WORKSPACE_LIST = 'workspace:list'
export const IPC_WORKSPACE_GET_BY_ID = 'workspace:getById'
export const IPC_WORKSPACE_UPDATE = 'workspace:update'
export const IPC_WORKSPACE_DELETE = 'workspace:delete'
export const IPC_WORKSPACE_CHECK_AVAILABLE = 'workspace:checkAvailable'
export const IPC_WORKSPACE_SWITCH = 'workspace:switch'

// 记忆相关
export const IPC_MEMORY_GET_GLOBAL = 'memory:getGlobal'
export const IPC_MEMORY_SET_GLOBAL = 'memory:setGlobal'
export const IPC_MEMORY_GET_WORKSPACE = 'memory:getWorkspace'
export const IPC_MEMORY_SET_WORKSPACE = 'memory:setWorkspace'
export const IPC_MEMORY_GET_CANDIDATES = 'memory:getCandidates'
export const IPC_MEMORY_APPROVE_CANDIDATE = 'memory:approveCandidate'
export const IPC_MEMORY_REJECT_CANDIDATE = 'memory:rejectCandidate'
export const IPC_MEMORY_GET_CONVERSATION_SUMMARY = 'memory:getConversationSummary'

// 文件工具相关
export const IPC_FILE_LIST = 'file:list'
export const IPC_FILE_READ = 'file:read'
export const IPC_FILE_SEARCH = 'file:search'

// 任务（Agent）相关
export const IPC_TASK_START = 'task:start'
export const IPC_TASK_STOP = 'task:stop'
export const IPC_TASK_GET_BY_ID = 'task:getById'
export const IPC_TASK_GET_BY_CONVERSATION = 'task:getByConversation'
export const IPC_TASK_GET_STEPS = 'task:getSteps'
export const IPC_TASK_GET_TOOL_CALLS = 'task:getToolCalls'
export const IPC_TASK_GET_LOGS = 'task:getLogs'
export const IPC_TASK_ROLLBACK = 'task:rollback'

// 任务事件（主进程→渲染进程）
export const IPC_TASK_EVENT = 'task:event'

// 权限审批相关
export const IPC_PERMISSION_DECIDE = 'permission:decide'
export const IPC_PERMISSION_GET_REQUEST = 'permission:getRequest'
export const IPC_PERMISSION_GET_BY_TASK = 'permission:getByTask'

// 文件变更相关
export const IPC_FILE_CHANGE_GET_BY_TASK = 'fileChange:getByTask'
export const IPC_FILE_CHANGE_RESTORE = 'fileChange:restore'

// 生成物相关
export const IPC_ARTIFACT_GET_BY_TASK = 'artifact:getByTask'
export const IPC_ARTIFACT_GET_BY_ID = 'artifact:getById'
export const IPC_ARTIFACT_OPEN_FILE = 'artifact:openFile'
export const IPC_ARTIFACT_OPEN_FOLDER = 'artifact:openFolder'
export const IPC_ARTIFACT_DELETE = 'artifact:delete'

// 命令执行相关
export const IPC_COMMAND_STOP = 'command:stop'
export const IPC_COMMAND_GET_OUTPUT = 'command:getOutput'
export const IPC_COMMAND_GET_BY_TASK = 'command:getByTask'

// 统计相关
export const IPC_STATS_GET_OVERVIEW = 'stats:getOverview'
export const IPC_STATS_GET_CONVERSATION_DETAIL = 'stats:getConversationDetail'

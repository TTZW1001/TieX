/**
 * 统一错误分类与用户友好提示
 * 所有错误码按类别分组，前端根据类别展示不同的 UI 样式
 */

// ===== 错误码枚举 =====
export const ErrorCode = {
  // 网络类
  NETWORK_ERROR: 'NETWORK_ERROR',
  NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
  NETWORK_DNS: 'NETWORK_DNS',
  NETWORK_CONNECTION_REFUSED: 'NETWORK_CONNECTION_REFUSED',

  // Provider 类
  PROVIDER_AUTH_FAILED: 'PROVIDER_AUTH_FAILED',
  PROVIDER_QUOTA_EXCEEDED: 'PROVIDER_QUOTA_EXCEEDED',
  PROVIDER_RATE_LIMIT: 'PROVIDER_RATE_LIMIT',
  PROVIDER_MODEL_NOT_FOUND: 'PROVIDER_MODEL_NOT_FOUND',
  PROVIDER_INVALID_CONFIG: 'PROVIDER_INVALID_CONFIG',
  PROVIDER_NOT_CONFIGURED: 'PROVIDER_NOT_CONFIGURED',
  PROVIDER_RESPONSE_ERROR: 'PROVIDER_RESPONSE_ERROR',

  // 安全类
  SECURITY_PATH_VIOLATION: 'SECURITY_PATH_VIOLATION',
  SECURITY_COMMAND_BLOCKED: 'SECURITY_COMMAND_BLOCKED',
  SECURITY_SCHEMA_INVALID: 'SECURITY_SCHEMA_INVALID',
  SECURITY_PERMISSION_DENIED: 'SECURITY_PERMISSION_DENIED',

  // 文件类
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_READ_ERROR: 'FILE_READ_ERROR',
  FILE_WRITE_ERROR: 'FILE_WRITE_ERROR',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  FILE_BACKUP_CONFLICT: 'FILE_BACKUP_CONFLICT',

  // 任务类
  TASK_TIMEOUT: 'TASK_TIMEOUT',
  TASK_ALREADY_RUNNING: 'TASK_ALREADY_RUNNING',
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  TASK_MAX_ROUNDS: 'TASK_MAX_ROUNDS',
  TASK_MAX_TOOL_CALLS: 'TASK_MAX_TOOL_CALLS',
  TASK_ABORTED: 'TASK_ABORTED',

  // 数据库类
  DB_ERROR: 'DB_ERROR',
  DB_NOT_FOUND: 'DB_NOT_FOUND',
  DB_CONSTRAINT: 'DB_CONSTRAINT',

  // 通用类
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode]

// ===== 错误类别 =====
export type ErrorCategory = 'network' | 'provider' | 'security' | 'file' | 'task' | 'database' | 'general'

// ===== 错误码→类别映射 =====
const CODE_CATEGORY_MAP: Record<string, ErrorCategory> = {
  [ErrorCode.NETWORK_ERROR]: 'network',
  [ErrorCode.NETWORK_TIMEOUT]: 'network',
  [ErrorCode.NETWORK_DNS]: 'network',
  [ErrorCode.NETWORK_CONNECTION_REFUSED]: 'network',
  [ErrorCode.PROVIDER_AUTH_FAILED]: 'provider',
  [ErrorCode.PROVIDER_QUOTA_EXCEEDED]: 'provider',
  [ErrorCode.PROVIDER_RATE_LIMIT]: 'provider',
  [ErrorCode.PROVIDER_MODEL_NOT_FOUND]: 'provider',
  [ErrorCode.PROVIDER_INVALID_CONFIG]: 'provider',
  [ErrorCode.PROVIDER_NOT_CONFIGURED]: 'provider',
  [ErrorCode.PROVIDER_RESPONSE_ERROR]: 'provider',
  [ErrorCode.SECURITY_PATH_VIOLATION]: 'security',
  [ErrorCode.SECURITY_COMMAND_BLOCKED]: 'security',
  [ErrorCode.SECURITY_SCHEMA_INVALID]: 'security',
  [ErrorCode.SECURITY_PERMISSION_DENIED]: 'security',
  [ErrorCode.FILE_NOT_FOUND]: 'file',
  [ErrorCode.FILE_READ_ERROR]: 'file',
  [ErrorCode.FILE_WRITE_ERROR]: 'file',
  [ErrorCode.FILE_TOO_LARGE]: 'file',
  [ErrorCode.FILE_BACKUP_CONFLICT]: 'file',
  [ErrorCode.TASK_TIMEOUT]: 'task',
  [ErrorCode.TASK_ALREADY_RUNNING]: 'task',
  [ErrorCode.TASK_NOT_FOUND]: 'task',
  [ErrorCode.TASK_MAX_ROUNDS]: 'task',
  [ErrorCode.TASK_MAX_TOOL_CALLS]: 'task',
  [ErrorCode.TASK_ABORTED]: 'task',
  [ErrorCode.DB_ERROR]: 'database',
  [ErrorCode.DB_NOT_FOUND]: 'database',
  [ErrorCode.DB_CONSTRAINT]: 'database',
  [ErrorCode.VALIDATION_ERROR]: 'general',
  [ErrorCode.UNKNOWN_ERROR]: 'general',
}

// ===== 错误码→中文用户提示映射 =====
const CODE_MESSAGE_MAP: Record<string, string> = {
  [ErrorCode.NETWORK_ERROR]: '网络连接失败，请检查网络设置',
  [ErrorCode.NETWORK_TIMEOUT]: '请求超时，请稍后重试',
  [ErrorCode.NETWORK_DNS]: 'DNS 解析失败，请检查网络连接',
  [ErrorCode.NETWORK_CONNECTION_REFUSED]: '服务器拒绝连接，请检查 API 地址配置',
  [ErrorCode.PROVIDER_AUTH_FAILED]: 'API 密钥无效，请检查设置',
  [ErrorCode.PROVIDER_QUOTA_EXCEEDED]: 'API 配额已用尽，请检查账户余额',
  [ErrorCode.PROVIDER_RATE_LIMIT]: '请求过于频繁，请稍后重试',
  [ErrorCode.PROVIDER_MODEL_NOT_FOUND]: '模型不存在，请检查模型名称配置',
  [ErrorCode.PROVIDER_INVALID_CONFIG]: '模型服务商配置无效，请检查设置',
  [ErrorCode.PROVIDER_NOT_CONFIGURED]: '未配置模型服务商，请先在设置中配置',
  [ErrorCode.PROVIDER_RESPONSE_ERROR]: '模型服务返回错误，请稍后重试',
  [ErrorCode.SECURITY_PATH_VIOLATION]: '路径访问被拒绝：不允许访问工作区外的文件',
  [ErrorCode.SECURITY_COMMAND_BLOCKED]: '命令被安全策略阻止',
  [ErrorCode.SECURITY_SCHEMA_INVALID]: '工具参数格式不正确',
  [ErrorCode.SECURITY_PERMISSION_DENIED]: '操作被用户拒绝',
  [ErrorCode.FILE_NOT_FOUND]: '文件不存在',
  [ErrorCode.FILE_READ_ERROR]: '文件读取失败',
  [ErrorCode.FILE_WRITE_ERROR]: '文件写入失败',
  [ErrorCode.FILE_TOO_LARGE]: '文件过大，无法处理',
  [ErrorCode.FILE_BACKUP_CONFLICT]: '文件已被其他操作修改，恢复存在冲突',
  [ErrorCode.TASK_TIMEOUT]: '任务执行超时',
  [ErrorCode.TASK_ALREADY_RUNNING]: '当前会话正在生成中，请先停止',
  [ErrorCode.TASK_NOT_FOUND]: '任务不存在',
  [ErrorCode.TASK_MAX_ROUNDS]: '已达到最大对话轮次限制',
  [ErrorCode.TASK_MAX_TOOL_CALLS]: '已达到最大工具调用次数限制',
  [ErrorCode.TASK_ABORTED]: '任务已被中止',
  [ErrorCode.DB_ERROR]: '数据库错误',
  [ErrorCode.DB_NOT_FOUND]: '数据不存在',
  [ErrorCode.DB_CONSTRAINT]: '数据约束冲突',
  [ErrorCode.VALIDATION_ERROR]: '输入验证失败',
  [ErrorCode.UNKNOWN_ERROR]: '未知错误',
}

// ===== 类别→中文标签 =====
export const CATEGORY_LABELS: Record<ErrorCategory, string> = {
  network: '网络错误',
  provider: '模型服务错误',
  security: '安全限制',
  file: '文件错误',
  task: '任务错误',
  database: '数据库错误',
  general: '错误',
}

// ===== 类别→样式映射 =====
export const CATEGORY_STYLES: Record<ErrorCategory, { bg: string; border: string; text: string; icon: string }> = {
  network: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e', icon: 'wifi-off' },
  provider: { bg: '#ede9fe', border: '#8b5cf6', text: '#5b21b6', icon: 'server' },
  security: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b', icon: 'shield-alert' },
  file: { bg: '#e0f2fe', border: '#0ea5e9', text: '#075985', icon: 'file-x' },
  task: { bg: '#fff7ed', border: '#f97316', text: '#9a3412', icon: 'clock' },
  database: { bg: '#f1f5f9', border: '#64748b', text: '#334155', icon: 'database' },
  general: { bg: '#f1f5f9', border: '#94a3b8', text: '#334155', icon: 'alert-circle' },
}

/**
 * 获取错误类别
 */
export function getErrorCategory(code: string): ErrorCategory {
  return CODE_CATEGORY_MAP[code] ?? 'general'
}

/**
 * 获取错误类别的中文标签
 */
export function getCategoryLabel(category: ErrorCategory): string {
  return CATEGORY_LABELS[category]
}

/**
 * 获取用户友好的中文错误提示
 */
export function getUserMessage(code: string, fallbackMessage?: string): string {
  return CODE_MESSAGE_MAP[code] ?? fallbackMessage ?? '操作失败，请重试'
}

/**
 * 创建统一的应用错误
 */
export class AppError extends Error {
  readonly code: ErrorCodeType | string
  readonly category: ErrorCategory
  readonly userMessage: string
  readonly details?: string

  constructor(code: string, options?: { message?: string; details?: string }) {
    const category = getErrorCategory(code)
    const userMessage = options?.message ?? getUserMessage(code)
    super(userMessage)
    this.name = 'AppError'
    this.code = code
    this.category = category
    this.userMessage = userMessage
    this.details = options?.details
  }

  /** 转换为前端可序列化的对象 */
  toJSON() {
    return {
      code: this.code,
      category: this.category,
      message: this.userMessage,
      details: this.details,
    }
  }
}

/**
 * 从未知错误中创建 AppError
 * 用于 catch 块中统一错误处理
 */
export function fromUnknown(err: unknown): AppError {
  if (err instanceof AppError) return err
  if (err instanceof Error) {
    // 尝试从常见错误消息中推断错误码
    const msg = err.message.toLowerCase()
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('econnrefused')) {
      return new AppError(ErrorCode.NETWORK_ERROR, { message: err.message })
    }
    if (msg.includes('timeout') || msg.includes('timed out')) {
      return new AppError(ErrorCode.NETWORK_TIMEOUT, { message: err.message })
    }
    if (msg.includes('api key') || msg.includes('unauthorized') || msg.includes('401')) {
      return new AppError(ErrorCode.PROVIDER_AUTH_FAILED, { message: err.message })
    }
    if (msg.includes('rate limit') || msg.includes('429')) {
      return new AppError(ErrorCode.PROVIDER_RATE_LIMIT, { message: err.message })
    }
    if (msg.includes('quota') || msg.includes('insufficient')) {
      return new AppError(ErrorCode.PROVIDER_QUOTA_EXCEEDED, { message: err.message })
    }
    return new AppError(ErrorCode.UNKNOWN_ERROR, { message: err.message })
  }
  return new AppError(ErrorCode.UNKNOWN_ERROR, {
    message: String(err),
  })
}

/**
 * 模型调用统一接口
 */
import type { ToolDefinition } from '../tools/agent-tool.types'

/** Provider 配置（主进程内存中使用，apiKey 为明文） */
export interface ProviderConfig {
  id: string
  name: string
  providerType: string // 服务商类型，用于工厂创建对应实例
  baseUrl: string
  model: string
  apiKey: string // 解密后的明文，仅在主进程内存中使用
  temperature?: number
  maxTokens?: number
  timeoutMs: number
  streamEnabled?: boolean
}

export interface ChatTextPart {
  type: 'text'
  text: string
}

export interface ChatImagePart {
  type: 'image_url'
  image_url: {
    url: string
  }
}

export type ChatMessageContent = string | Array<ChatTextPart | ChatImagePart>

/** 聊天消息 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: ChatMessageContent
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

/** 模型请求 */
export interface ModelRequest {
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  /** 工具定义（Agent 模式） */
  tools?: ToolDefinition[]
  /** 工具调用选择策略 */
  toolChoice?: 'auto' | 'none' | 'required'
  /** Provider 配置（供 Provider 实现使用） */
  config?: ProviderConfig
}

/** Token 使用量 */
export interface TokenUsage {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

/** Provider 错误类型 */
export type ProviderErrorCode =
  | 'PROVIDER_AUTH_ERROR'
  | 'PROVIDER_RATE_LIMIT'
  | 'PROVIDER_BALANCE_ERROR'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_NETWORK_ERROR'
  | 'PROVIDER_RESPONSE_INVALID'
  | 'PROVIDER_NO_API_KEY'

/** Provider 错误 */
export interface ProviderError {
  code: ProviderErrorCode
  message: string // 用户友好的中文提示
  detail?: string // 原始错误信息，不展示给用户
}

/** 流式事件 */
export type ModelStreamEvent =
  | { type: 'delta'; content: string }
  | { type: 'tool_call_delta'; delta: any }
  | { type: 'finish'; reason: string; usage?: TokenUsage }
  | { type: 'done'; usage?: TokenUsage }
  | { type: 'error'; error: ProviderError }

/** 连接测试结果 */
export interface ProviderTestResult {
  success: boolean
  message: string
}

/** ModelProvider 接口 */
export interface IModelProvider {
  testConnection(config: ProviderConfig): Promise<ProviderTestResult>
  streamChat(request: ModelRequest, signal: AbortSignal): AsyncIterable<ModelStreamEvent>
}

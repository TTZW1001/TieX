/**
 * 流式聊天工具函数
 * 抽取 ChatService 和 Agent Runtime 共享的流式处理逻辑
 */
import type { ModelRequest, TokenUsage } from '../providers/model-provider'
import type { IModelProvider } from '../providers/model-provider'
import { getProvider } from '../providers/provider-factory'

/** 流式文本事件回调 */
export interface StreamCallbacks {
  /** 收到文本 delta */
  onDelta?: (fullContent: string, delta: string) => void
  /** 收到工具调用 delta */
  onToolCallDelta?: (delta: any) => void
  /** 流式完成 */
  onDone?: (usage?: TokenUsage) => void
  /** 流式错误 */
  onError?: (code: string, message: string) => void
}

/**
 * 执行流式聊天请求，通过回调推送事件
 * @returns 最终累积的完整文本内容
 */
export async function streamChatWithCallbacks(
  modelRequest: ModelRequest,
  signal: AbortSignal,
  callbacks: StreamCallbacks
): Promise<string> {
  const config = modelRequest.config
  const provider: IModelProvider = getProvider(config?.providerType ?? 'deepseek')

  let fullContent = ''
  let lastUsage: TokenUsage | undefined

  try {
    for await (const streamEvent of provider.streamChat(modelRequest, signal)) {
      if (signal.aborted) break

      if (streamEvent.type === 'delta') {
        fullContent += streamEvent.content
        callbacks.onDelta?.(fullContent, streamEvent.content)
      } else if (streamEvent.type === 'tool_call_delta') {
        callbacks.onToolCallDelta?.(streamEvent.delta)
      } else if (streamEvent.type === 'finish') {
        lastUsage = streamEvent.usage ?? lastUsage
      } else if (streamEvent.type === 'done') {
        lastUsage = streamEvent.usage ?? lastUsage
        callbacks.onDone?.(lastUsage)
        break
      } else if (streamEvent.type === 'error') {
        callbacks.onError?.(streamEvent.error.code, streamEvent.error.message)
        break
      }
    }
  } catch (err: any) {
    if (err.name === 'AbortError' || signal.aborted) {
      // 用户主动取消，静默返回
      return fullContent
    }
    callbacks.onError?.('PROVIDER_NETWORK_ERROR', err.message || '模型请求失败')
  }

  return fullContent
}

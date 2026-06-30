import type {
  IModelProvider,
  ProviderConfig,
  ProviderTestResult,
  ModelRequest,
  ModelStreamEvent,
  ProviderError,
  ProviderErrorCode,
} from './model-provider'

export interface OpenAICompatibleProviderOptions {
  providerName: string
  testPath?: string
  chatPath?: string
}

function classifyError(status: number | null, body: string): ProviderError {
  if (status === 401 || status === 403) {
    return {
      code: 'PROVIDER_AUTH_ERROR',
      message: 'API Key 无效或已过期，请检查设置',
      detail: body,
    }
  }
  if (status === 429) {
    return {
      code: 'PROVIDER_RATE_LIMIT',
      message: '请求频率超限，请稍后重试',
      detail: body,
    }
  }
  if (status === 402 || body.includes('insufficient_balance') || body.includes('Insufficient balance')) {
    return {
      code: 'PROVIDER_BALANCE_ERROR',
      message: '账户余额不足，请充值后重试',
      detail: body,
    }
  }
  if (status === 400) {
    return {
      code: 'PROVIDER_RESPONSE_INVALID',
      message: '请求参数异常，请检查模型配置',
      detail: body,
    }
  }
  if (status && status >= 500) {
    return {
      code: 'PROVIDER_NETWORK_ERROR',
      message: '服务器错误，请稍后重试',
      detail: `HTTP ${status}: ${body}`,
    }
  }
  return {
    code: 'PROVIDER_NETWORK_ERROR',
    message: '网络连接失败，请检查网络',
    detail: body,
  }
}

export class OpenAICompatibleProvider implements IModelProvider {
  private readonly providerName: string
  private readonly testPath: string
  private readonly chatPath: string

  constructor(options: OpenAICompatibleProviderOptions) {
    this.providerName = options.providerName
    this.testPath = options.testPath ?? '/chat/completions'
    this.chatPath = options.chatPath ?? '/chat/completions'
  }

  async testConnection(config: ProviderConfig): Promise<ProviderTestResult> {
    if (!config.apiKey) {
      return { success: false, message: '未配置 API Key，请先在设置中填写' }
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs)

      const response = await fetch(`${config.baseUrl}${this.testPath}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5,
          stream: false,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        return { success: true, message: `连接成功：${this.providerName} API 可用` }
      }

      const body = await response.text().catch(() => '')
      const error = classifyError(response.status, body)
      return { success: false, message: error.message }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { success: false, message: '连接超时，请检查网络或增加超时时间' }
      }
      return { success: false, message: '网络连接失败，请检查网络设置' }
    }
  }

  async *streamChat(request: ModelRequest, signal: AbortSignal): AsyncIterable<ModelStreamEvent> {
    const config = request.config

    if (!config?.apiKey) {
      yield {
        type: 'error',
        error: {
          code: 'PROVIDER_NO_API_KEY' as ProviderErrorCode,
          message: '未配置 API Key，请先在设置中填写',
        },
      }
      return
    }

    const streamEnabled = config.streamEnabled !== false
    const body: Record<string, unknown> = {
      model: config.model,
      messages: request.messages.map((message) => {
        const result: Record<string, unknown> = {
          role: message.role,
          content: message.content,
        }
        if (message.tool_calls) result.tool_calls = message.tool_calls
        if (message.tool_call_id) result.tool_call_id = message.tool_call_id
        return result
      }),
      temperature: request.temperature ?? config.temperature,
      top_p: request.topP ?? config.topP,
      max_tokens: request.maxTokens ?? config.maxTokens,
      stream: streamEnabled,
    }

    if (config.toolsEnabled !== false && request.tools && request.tools.length > 0) {
      body.tools = request.tools
      body.tool_choice = request.toolChoice ?? 'auto'
    }

    let response: Response

    try {
      response = await fetch(`${config.baseUrl}${this.chatPath}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      })
    } catch (err: any) {
      if (err.name === 'AbortError') return
      yield {
        type: 'error',
        error: {
          code: 'PROVIDER_NETWORK_ERROR' as ProviderErrorCode,
          message: '网络连接失败，请检查网络',
          detail: err.message,
        },
      }
      return
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      const error = classifyError(response.status, errorBody)
      yield { type: 'error', error }
      return
    }

    if (!streamEnabled) {
      let parsed: any
      try {
        parsed = await response.json()
      } catch {
        yield {
          type: 'error',
          error: {
            code: 'PROVIDER_RESPONSE_INVALID' as ProviderErrorCode,
            message: '响应格式异常，未收到有效数据',
          },
        }
        return
      }

      const choice = parsed.choices?.[0]
      const message = choice?.message
      const content = typeof message?.content === 'string' ? message.content : ''
      const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : []
      const finishReason = choice?.finish_reason ?? (toolCalls.length > 0 ? 'tool_calls' : 'stop')
      const usage = parsed.usage
        ? {
            promptTokens: parsed.usage.prompt_tokens,
            completionTokens: parsed.usage.completion_tokens,
            totalTokens: parsed.usage.total_tokens,
          }
        : undefined

      if (content) {
        yield { type: 'delta', content }
      }
      if (toolCalls.length > 0) {
        yield { type: 'tool_call_delta', delta: toolCalls }
      }
      yield { type: 'finish', reason: finishReason, usage }
      yield { type: 'done', usage }
      return
    }

    if (!response.body) {
      yield {
        type: 'error',
        error: {
          code: 'PROVIDER_RESPONSE_INVALID' as ProviderErrorCode,
          message: '响应格式异常，未收到有效数据',
        },
      }
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue

          const data = trimmed.slice(6)
          if (data === '[DONE]') {
            yield { type: 'done' }
            return
          }

          try {
            const parsed = JSON.parse(data)
            const choice = parsed.choices?.[0]
            const delta = choice?.delta

            if (delta?.content) {
              yield { type: 'delta', content: delta.content }
            }

            if (delta?.tool_calls) {
              yield { type: 'tool_call_delta', delta: delta.tool_calls }
            }

            const finishReason = choice?.finish_reason
            if (finishReason) {
              const usage = parsed.usage
                ? {
                    promptTokens: parsed.usage.prompt_tokens,
                    completionTokens: parsed.usage.completion_tokens,
                    totalTokens: parsed.usage.total_tokens,
                  }
                : undefined
              yield { type: 'finish', reason: finishReason, usage }
              if (finishReason === 'stop' || finishReason === 'tool_calls') {
                yield { type: 'done', usage }
                return
              }
            }
          } catch {
            // ignore invalid SSE row
          }
        }
      }

      yield { type: 'done' }
    } catch (err: any) {
      if (err.name === 'AbortError') return
      yield {
        type: 'error',
        error: {
          code: 'PROVIDER_NETWORK_ERROR' as ProviderErrorCode,
          message: '流式传输中断，请重试',
          detail: err.message,
        },
      }
    }
  }
}

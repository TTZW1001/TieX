/**
 * Response Parser - 模型响应解析
 * 解析 DeepSeek 流式响应，提取文本内容和工具调用
 */
import type { ModelToolCall } from '../tools/agent-tool.types'

function normalizeToolArguments(args: string): string {
  return args
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/，/g, ',')
    .replace(/：/g, ':')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
}

/**
 * 尝试修复模型输出被截断的 JSON 字符串
 * 常见截断位置：字符串值中间、对象末尾、数组末尾
 */
function repairTruncatedJson(input: string): string {
  let s = input

  // 去除尾部逗号、空白
  s = s.replace(/[\s,]+$/, '')

  // 状态机扫描：记录是否在字符串内
  let inString = false
  let escape = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (escape) {
      escape = false
      continue
    }
    if (inString) {
      if (ch === '\\') {
        escape = true
      } else if (ch === '"') {
        inString = false
      }
    } else {
      if (ch === '"') {
        inString = true
      }
    }
  }

  // 如果最后停留在字符串内，闭合字符串
  if (inString) {
    s += '"'
  }

  // 统计未闭合的 { 和 [
  const stack: string[] = []
  let inStr = false
  let esc = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (esc) {
      esc = false
      continue
    }
    if (inStr) {
      if (ch === '\\') {
        esc = true
      } else if (ch === '"') {
        inStr = false
      }
    } else {
      if (ch === '"') inStr = true
      else if (ch === '{') stack.push('}')
      else if (ch === '[') stack.push(']')
      else if (ch === '}' || ch === ']') stack.pop()
    }
  }

  // 按后进先出顺序补齐闭合符号
  while (stack.length > 0) {
    s += stack.pop()
  }

  return s
}

function tryParseToolArguments(args: string): unknown {
  const candidates: string[] = []
  const normalized = normalizeToolArguments(args)
  candidates.push(normalized)
  candidates.push(repairTruncatedJson(normalized))

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      // continue
    }
  }

  throw new Error('INVALID_JSON')
}

/** 模型响应类型 */
export type ModelResponse =
  | { type: 'final_text'; content: string }
  | { type: 'tool_calls'; toolCalls: ModelToolCall[] }
  | { type: 'tool_calls_with_text'; textContent: string; toolCalls: ModelToolCall[] }
  | { type: 'invalid'; reason: string }

/** 流式响应累积器 */
export class StreamAccumulator {
  private textContent = ''
  private toolCallChunks = new Map<
    number,
    { id?: string; name?: string; arguments: string }
  >()
  private finishReason: string | null = null

  /**
   * 处理 SSE delta 数据
   */
  processDelta(delta: any): void {
    // 累积文本内容
    if (delta?.content) {
      this.textContent += delta.content
    }

    // 累积工具调用
    if (delta?.tool_calls && Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const index = tc.index ?? 0
        if (!this.toolCallChunks.has(index)) {
          this.toolCallChunks.set(index, { arguments: '' })
        }
        const chunk = this.toolCallChunks.get(index)!

        if (tc.id) {
          chunk.id = tc.id
        }
        if (tc.function?.name) {
          chunk.name = tc.function.name
        }
        if (tc.function?.arguments) {
          chunk.arguments += tc.function.arguments
        }
      }
    }
  }

  /**
   * 设置 finish_reason
   */
  setFinishReason(reason: string): void {
    this.finishReason = reason
  }

  /**
   * 获取累积的文本内容
   */
  getTextContent(): string {
    return this.textContent
  }

  /**
   * 解析最终响应
   */
  parseResponse(): ModelResponse {
    // 如果有工具调用
    if (this.toolCallChunks.size > 0) {
      const toolCalls: ModelToolCall[] = []
      const sortedIndexes = Array.from(this.toolCallChunks.keys()).sort((a, b) => a - b)

      for (const index of sortedIndexes) {
        const chunk = this.toolCallChunks.get(index)!

        // 校验工具名称
        if (!chunk.name || chunk.name.trim() === '') {
          return {
            type: 'invalid',
            reason: '工具调用缺少工具名称',
          }
        }

        // 解析参数 JSON
        let args: unknown
        const argsStr = chunk.arguments.trim()
        if (argsStr === '') {
          args = {}
        } else {
          try {
            args = tryParseToolArguments(argsStr)
          } catch {
            return {
              type: 'invalid',
              reason: `工具 "${chunk.name}" 的参数不是合法 JSON: ${argsStr.slice(0, 200)}`,
            }
          }
        }

        toolCalls.push({
          id: chunk.id || `call_${index}_${Date.now()}`,
          name: chunk.name,
          arguments: args,
        })
      }

      // 如果同时有文本内容，使用 tool_calls_with_text 保留两者
      if (this.textContent.trim() !== '') {
        return { type: 'tool_calls_with_text', textContent: this.textContent, toolCalls }
      }

      return { type: 'tool_calls', toolCalls }
    }

    // 如果有文本内容
    if (this.textContent.trim() !== '') {
      return { type: 'final_text', content: this.textContent }
    }

    // 空响应
    if (this.finishReason === 'stop') {
      return { type: 'invalid', reason: '模型返回空内容' }
    }

    return { type: 'invalid', reason: `模型响应异常，finish_reason: ${this.finishReason ?? 'unknown'}` }
  }

  /**
   * 重置累积器
   */
  reset(): void {
    this.textContent = ''
    this.toolCallChunks.clear()
    this.finishReason = null
  }
}

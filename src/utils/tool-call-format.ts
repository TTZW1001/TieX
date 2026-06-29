import type { ToolCallEntity } from '@/types/global'

export interface ToolDisplayField {
  label: string
  value: string
}

export interface ToolDisplayInfo {
  title: string
  verb: string
  summary: string
  detail?: string
  fields: ToolDisplayField[]
  rawArguments: string
  rawResult: string
  hasResult: boolean
}

function parseJson(value: string | null): unknown {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function boolText(value: unknown): string {
  return value ? '是' : '否'
}

function formatBytes(value: unknown): string {
  const bytes = asNumber(value)
  if (bytes === null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatJson(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

function fileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path
}

function countLines(text: unknown): number | null {
  if (typeof text !== 'string') return null
  if (!text) return 0
  return text.split(/\r?\n/).length
}

function firstMatchPreview(result: Record<string, unknown>): string {
  const results = Array.isArray(result.results) ? result.results : []
  const first = asRecord(results[0])
  const matches = Array.isArray(first.matches) ? first.matches : []
  const match = asRecord(matches[0])
  const content = asString(match.content)
  if (content) return content.trim()
  return asString(first.path) || asString(first.fileName)
}

export function getToolDisplayInfo(toolCall: ToolCallEntity): ToolDisplayInfo {
  const args = asRecord(parseJson(toolCall.arguments))
  const result = asRecord(parseJson(toolCall.result))
  const rawArguments = formatJson(parseJson(toolCall.arguments))
  const rawResult = formatJson(parseJson(toolCall.result))
  const hasResult = !!toolCall.result

  switch (toolCall.tool_name) {
    case 'list_files': {
      const path = asString(args.path, '工作区根目录')
      const total = asNumber(result.total)
      const entries = Array.isArray(result.entries) ? result.entries : []
      const directories = entries.filter((entry) => asRecord(entry).type === 'directory').length
      const files = entries.filter((entry) => asRecord(entry).type === 'file').length
      return {
        title: '浏览目录',
        verb: '列出',
        summary: total === null ? `查看 ${path}` : `查看 ${path}，找到 ${total} 项`,
        detail: total === null ? undefined : `${directories} 个目录，${files} 个文件`,
        fields: [
          { label: '路径', value: path },
          { label: '深度', value: String(args.maxDepth ?? 1) },
          { label: '包含隐藏项', value: boolText(args.includeHidden) },
        ],
        rawArguments,
        rawResult,
        hasResult,
      }
    }
    case 'read_file': {
      const path = asString(args.path, '未指定文件')
      const totalSize = formatBytes(result.totalSize)
      const lines = countLines(result.content)
      return {
        title: '读取文件',
        verb: '读取',
        summary: `读取 ${path}`,
        detail: [
          lines !== null ? `${lines} 行` : '',
          totalSize,
          result.isTruncated ? '内容已截断' : '',
        ].filter(Boolean).join(' · '),
        fields: [
          { label: '文件', value: path },
          { label: '起始偏移', value: String(args.startOffset ?? 0) },
          { label: '读取长度', value: String(args.maxLength ?? '默认') },
        ],
        rawArguments,
        rawResult,
        hasResult,
      }
    }
    case 'search_files': {
      const query = asString(args.pattern, '未指定关键词')
      const path = asString(args.path, '工作区根目录')
      const total = asNumber(result.total)
      const preview = firstMatchPreview(result)
      return {
        title: '搜索工作区',
        verb: '搜索',
        summary: total === null ? `搜索 ${query}` : `搜索 ${query}，命中 ${total} 个结果`,
        detail: preview || (result.truncated ? '结果已截断' : undefined),
        fields: [
          { label: '关键词', value: query },
          { label: '范围', value: path },
          { label: '文件模式', value: asString(args.filePattern, '不限') },
          { label: '搜索内容', value: boolText(args.searchContent) },
        ],
        rawArguments,
        rawResult,
        hasResult,
      }
    }
    case 'create_file':
    case 'create_markdown':
    case 'create_docx':
    case 'create_pptx': {
      const path = asString(args.path, asString(result.path, '未指定文件'))
      const typeName =
        toolCall.tool_name === 'create_markdown'
          ? 'Markdown'
          : toolCall.tool_name === 'create_docx'
            ? 'Word 文档'
            : toolCall.tool_name === 'create_pptx'
              ? '演示文稿'
              : '文件'
      const size = formatBytes(result.sizeBytes ?? result.size)
      return {
        title: `创建${typeName}`,
        verb: '写入',
        summary: `${result.created === false || args.overwrite ? '覆盖' : '创建'} ${path}`,
        detail: size ? `${fileName(path)} · ${size}` : fileName(path),
        fields: [
          { label: '文件', value: path },
          { label: '允许覆盖', value: boolText(args.overwrite) },
        ],
        rawArguments,
        rawResult,
        hasResult,
      }
    }
    case 'edit_file': {
      const path = asString(args.path, asString(result.path, '未指定文件'))
      const edits = Array.isArray(args.edits) ? args.edits.length : null
      const replacements = asNumber(result.replacements)
      return {
        title: '修改文件',
        verb: '编辑',
        summary: `修改 ${path}`,
        detail: [
          replacements !== null ? `替换 ${replacements} 处` : edits !== null ? `计划 ${edits} 处编辑` : '',
          result.diffSummary ? '已生成 diff' : '',
        ].filter(Boolean).join(' · '),
        fields: [
          { label: '文件', value: path },
          { label: '编辑数', value: String(edits ?? '未知') },
        ],
        rawArguments,
        rawResult,
        hasResult,
      }
    }
    case 'run_command': {
      const command = asString(args.command, asString(result.command, '命令'))
      const commandArgs = Array.isArray(args.args) ? args.args.map(String) : []
      const exitCode = result.exitCode === null || result.exitCode === undefined ? '无' : String(result.exitCode)
      return {
        title: '执行命令',
        verb: '运行',
        summary: [command, ...commandArgs].join(' '),
        detail: `状态 ${asString(result.status, toolCall.status)} · 退出码 ${exitCode}`,
        fields: [
          { label: '命令', value: [command, ...commandArgs].join(' ') },
          { label: '超时', value: args.timeoutMs ? `${args.timeoutMs}ms` : '默认' },
          { label: '说明', value: asString(args.description, '无') },
        ],
        rawArguments,
        rawResult,
        hasResult,
      }
    }
    default:
      return {
        title: toolCall.tool_name,
        verb: '工具',
        summary: toolCall.tool_name,
        fields: [],
        rawArguments,
        rawResult,
        hasResult,
      }
  }
}

export function getToolStatusText(status: string): string {
  switch (status) {
    case 'completed':
      return '已完成'
    case 'running':
      return '执行中'
    case 'failed':
      return '失败'
    case 'pending':
      return '等待中'
    case 'requested':
      return '已请求'
    case 'rejected':
      return '已拒绝'
    default:
      return status
  }
}

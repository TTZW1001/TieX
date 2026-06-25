/**
 * Agent 工具注册 - 将阶段四的只读工具包装为 AgentTool
 */
import type { AgentTool, ToolExecutionContext } from './agent-tool.types'
import type {
  ListFilesInput,
  ReadFileInput,
  SearchFilesInput,
} from './tool.types'
import { listFilesTool } from './list-files.tool'
import { readFileTool } from './read-file.tool'
import { searchFilesTool } from './search-files.tool'
import { createFileTool } from './create-file.tool'
import { editFileTool } from './edit-file.tool'
import { createMarkdownTool } from './create-markdown.tool'
import { createDocxTool } from './create-docx.tool'
import { createPptxTool } from './create-pptx.tool'
import { runCommandTool } from './run-command.tool'
import { toolRegistry } from './tool-registry'

/** 工具输出最大字符数 */
const MAX_TOOL_OUTPUT_CHARS = 50000

/**
 * 截断工具输出
 */
function truncateOutput(output: unknown): { result: unknown; truncated: boolean } {
  const json = JSON.stringify(output)
  if (json.length <= MAX_TOOL_OUTPUT_CHARS) {
    return { result: output, truncated: false }
  }
  const truncated = json.slice(0, MAX_TOOL_OUTPUT_CHARS)
  return {
    result: {
      truncated: true,
      message: `工具输出超过 ${MAX_TOOL_OUTPUT_CHARS} 字符，已截断。请使用更精确的参数缩小范围。`,
      partial: truncated,
    },
    truncated: true,
  }
}

/** list_files Agent 工具 */
const listFilesAgentTool: AgentTool<ListFilesInput, unknown> = {
  name: 'list_files',
  description:
    '列出工作区指定路径下的文件和子目录。返回文件名、相对路径、类型、大小和修改时间。默认忽略 node_modules 和 .git 目录。',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '相对于工作区根目录的路径，默认为空（根目录）',
      },
      includeHidden: {
        type: 'boolean',
        description: '是否包含隐藏文件（以 . 开头），默认 false',
      },
      maxDepth: {
        type: 'integer',
        minimum: 1,
        maximum: 3,
        description: '递归深度，1 表示仅当前目录，默认 1',
      },
    },
    additionalProperties: false,
  },
  minimumPermission: 'read',
  riskLevel: 'low',

  validate(input: unknown): ListFilesInput {
    const result: ListFilesInput = {
      path: typeof (input as any)?.path === 'string' ? (input as any).path : '',
    }
    if (typeof (input as any)?.includeHidden === 'boolean') {
      result.includeHidden = (input as any).includeHidden
    }
    if (typeof (input as any)?.maxDepth === 'number') {
      result.maxDepth = (input as any).maxDepth
    }
    return result
  },

  async execute(context: ToolExecutionContext, input: ListFilesInput) {
    if (!context.workspaceRoot) {
      throw new Error('未设置工作区根路径')
    }
    return listFilesTool.execute(context.workspaceRoot, input)
  },
}

/** read_file Agent 工具 */
const readFileAgentTool: AgentTool<ReadFileInput, unknown> = {
  name: 'read_file',
  description:
    '读取工作区内指定文本文件的内容。支持分段读取（通过 startOffset 和 maxLength）。单次最大读取 1MB。仅支持文本文件。',
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '相对于工作区根目录的文件路径（必填）',
      },
      startOffset: {
        type: 'integer',
        minimum: 0,
        description: '起始偏移量（字节），默认 0',
      },
      maxLength: {
        type: 'integer',
        minimum: 1,
        maximum: 1048576,
        description: '最大读取长度（字节），默认 65536（64KB）',
      },
    },
    required: ['path'],
    additionalProperties: false,
  },
  minimumPermission: 'read',
  riskLevel: 'low',

  validate(input: unknown): ReadFileInput {
    const result: ReadFileInput = {
      path: String((input as any)?.path ?? ''),
    }
    if (typeof (input as any)?.startOffset === 'number') {
      result.startOffset = (input as any).startOffset
    }
    if (typeof (input as any)?.maxLength === 'number') {
      result.maxLength = (input as any).maxLength
    }
    return result
  },

  async execute(context: ToolExecutionContext, input: ReadFileInput) {
    if (!context.workspaceRoot) {
      throw new Error('未设置工作区根路径')
    }
    return readFileTool.execute(context.workspaceRoot, input)
  },
}

/** search_files Agent 工具 */
const searchFilesAgentTool: AgentTool<SearchFilesInput, unknown> = {
  name: 'search_files',
  description:
    '在工作区内搜索匹配指定 pattern 的文件名或文件内容。支持文件名通配符（filePattern）和内容搜索（searchContent=true）。',
  schema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: '搜索关键词或正则表达式（必填）',
      },
      path: {
        type: 'string',
        description: '搜索起始路径（相对路径），默认为工作区根目录',
      },
      filePattern: {
        type: 'string',
        description: '文件名匹配模式，如 "*.ts"、"*.json"',
      },
      maxResults: {
        type: 'integer',
        minimum: 1,
        maximum: 200,
        description: '最大返回结果数，默认 50',
      },
      searchContent: {
        type: 'boolean',
        description: '是否搜索文件内容（而非仅文件名），默认 false',
      },
    },
    required: ['pattern'],
    additionalProperties: false,
  },
  minimumPermission: 'read',
  riskLevel: 'low',

  validate(input: unknown): SearchFilesInput {
    const result: SearchFilesInput = {
      pattern: String((input as any)?.pattern ?? ''),
    }
    if (typeof (input as any)?.path === 'string') {
      result.path = (input as any).path
    }
    if (typeof (input as any)?.filePattern === 'string') {
      result.filePattern = (input as any).filePattern
    }
    if (typeof (input as any)?.maxResults === 'number') {
      result.maxResults = (input as any).maxResults
    }
    if (typeof (input as any)?.searchContent === 'boolean') {
      result.searchContent = (input as any).searchContent
    }
    return result
  },

  async execute(context: ToolExecutionContext, input: SearchFilesInput) {
    if (!context.workspaceRoot) {
      throw new Error('未设置工作区根路径')
    }
    return searchFilesTool.execute(context.workspaceRoot, input)
  },
}

/**
 * 注册所有 Agent 工具
 * 在应用启动时调用
 */
export function registerAgentTools(): void {
  toolRegistry.register(listFilesAgentTool)
  toolRegistry.register(readFileAgentTool)
  toolRegistry.register(searchFilesAgentTool)
  toolRegistry.register(createFileTool)
  toolRegistry.register(editFileTool)
  toolRegistry.register(createMarkdownTool)
  toolRegistry.register(createDocxTool)
  toolRegistry.register(createPptxTool)
  toolRegistry.register(runCommandTool)
}

/** 导出截断函数供 ToolExecutor 使用 */
export { truncateOutput, MAX_TOOL_OUTPUT_CHARS }

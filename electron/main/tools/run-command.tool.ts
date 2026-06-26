/**
 * run_command Agent 工具
 * 在工作区内执行受限命令
 */
import type { AgentTool, ToolExecutionContext } from './agent-tool.types'
import { commandService } from '../services/command.service'

export interface RunCommandToolInput {
  command: string
  args: string[]
  description?: string
  timeoutMs?: number
}

export interface RunCommandToolOutput {
  sessionId: string
  command: string
  args: string[]
  status: 'completed' | 'failed' | 'stopped' | 'timeout'
  exitCode: number | null
  output: string
  truncated: boolean
}

export const runCommandTool: AgentTool<RunCommandToolInput, RunCommandToolOutput> = {
  name: 'run_command',
  description:
    '在工作区内执行受限命令。支持 npm、git、node、python、npx 等命令。低风险命令可直接执行，高风险命令仍需用户确认。工作目录固定为工作区根目录，不支持 shell 元字符（如 &&、|、> 等）。',
  schema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: '可执行程序名（如 npm、git、node、python、npx）',
      },
      args: {
        type: 'array',
        items: { type: 'string' },
        description: '参数数组，不包含 shell 元字符',
      },
      description: {
        type: 'string',
        description: '执行此命令的目的说明（用于审批弹窗展示）',
      },
      timeoutMs: {
        type: 'integer',
        minimum: 5000,
        maximum: 300000,
        description: '超时时间（毫秒），默认 60000',
      },
    },
    required: ['command', 'args'],
    additionalProperties: false,
  },
  minimumPermission: 'command',
  riskLevel: 'high',

  validate(input: unknown): RunCommandToolInput {
    const result: RunCommandToolInput = {
      command: String((input as any)?.command ?? ''),
      args: Array.isArray((input as any)?.args)
        ? (input as any).args.map((a: unknown) => String(a))
        : [],
    }
    if (typeof (input as any)?.description === 'string') {
      result.description = (input as any).description
    }
    if (typeof (input as any)?.timeoutMs === 'number') {
      result.timeoutMs = (input as any).timeoutMs
    }
    return result
  },

  async execute(context: ToolExecutionContext, input: RunCommandToolInput): Promise<RunCommandToolOutput> {
    if (!context.workspaceRoot) {
      throw new Error('未设置工作区根路径，无法执行命令')
    }

    const result = await commandService.execute({
      command: input.command,
      args: input.args,
      cwd: context.workspaceRoot,
      timeoutMs: input.timeoutMs ?? 60000,
      maxOutputChars: 51200,
      taskId: context.taskId,
      conversationId: context.conversationId,
    })

    if (!result.ok && !result.session) {
      // 命令被策略拒绝
      throw new Error(result.error || '命令被安全策略拒绝')
    }

    const session = result.session!

    return {
      sessionId: session.sessionId,
      command: session.command,
      args: session.args,
      status: session.status === 'running' ? 'completed' : session.status,
      exitCode: session.exitCode,
      output: session.output,
      truncated: session.truncated,
    }
  },
}

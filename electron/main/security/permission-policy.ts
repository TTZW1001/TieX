/**
 * PermissionPolicy - 权限规则引擎
 * 判断工具调用是否需要权限审批，以及风险等级
 */
import type { ToolRiskLevel } from '../../shared/types'

export interface PermissionCheckResult {
  required: boolean
  reason?: string
  riskLevel?: ToolRiskLevel
}

/**
 * 权限规则表
 * 定义各工具在不同场景下的风险等级和是否需要审批
 */
const TOOL_PERMISSION_RULES: Record<string, {
  defaultRisk: ToolRiskLevel
  defaultRequireApproval: boolean
  scenarios?: Array<{
    condition: (input: any) => boolean
    risk: ToolRiskLevel
    requireApproval: boolean
    reason: string
  }>
}> = {
  create_file: {
    defaultRisk: 'medium',
    defaultRequireApproval: true,
    scenarios: [
      {
        condition: (input: any) => input.overwrite === true,
        risk: 'high',
        requireApproval: true,
        reason: '将覆盖已有文件',
      },
      {
        condition: (input: any) => input.overwrite !== true,
        risk: 'medium',
        requireApproval: true,
        reason: '将在工作区内创建新文件',
      },
    ],
  },
  edit_file: {
    defaultRisk: 'high',
    defaultRequireApproval: true,
    scenarios: [
      {
        condition: () => true,
        risk: 'high',
        requireApproval: true,
        reason: '将修改已有文件',
      },
    ],
  },
  list_files: {
    defaultRisk: 'low',
    defaultRequireApproval: false,
  },
  read_file: {
    defaultRisk: 'low',
    defaultRequireApproval: false,
  },
  search_files: {
    defaultRisk: 'low',
    defaultRequireApproval: false,
  },
  create_markdown: {
    defaultRisk: 'medium',
    defaultRequireApproval: true,
    scenarios: [
      {
        condition: (input: any) => input.overwrite === true,
        risk: 'high',
        requireApproval: true,
        reason: '将覆盖已有 Markdown 文件',
      },
      {
        condition: (input: any) => input.overwrite !== true,
        risk: 'medium',
        requireApproval: true,
        reason: '将生成新的 Markdown 文档',
      },
    ],
  },
  create_docx: {
    defaultRisk: 'medium',
    defaultRequireApproval: true,
    scenarios: [
      {
        condition: (input: any) => input.overwrite === true,
        risk: 'high',
        requireApproval: true,
        reason: '将覆盖已有 DOCX 文件',
      },
      {
        condition: (input: any) => input.overwrite !== true,
        risk: 'medium',
        requireApproval: true,
        reason: '将生成新的 Word 文档',
      },
    ],
  },
  create_pptx: {
    defaultRisk: 'medium',
    defaultRequireApproval: true,
    scenarios: [
      {
        condition: (input: any) => input.overwrite === true,
        risk: 'high',
        requireApproval: true,
        reason: '将覆盖已有 PPTX 文件',
      },
      {
        condition: (input: any) => input.overwrite !== true,
        risk: 'medium',
        requireApproval: true,
        reason: '将生成新的 PowerPoint 演示文件',
      },
    ],
  },
  run_command: {
    defaultRisk: 'high',
    defaultRequireApproval: true,
    scenarios: [
      {
        condition: (input: any) => {
          const cmd = (input as any)?.command || ''
          const args = (input as any)?.args || []
          const fullCmd = args.length > 0 ? `${cmd} ${args[0]}` : cmd
          return ['npm run build', 'npm run test', 'npm run lint', 'npm test'].includes(fullCmd)
        },
        risk: 'medium',
        requireApproval: true,
        reason: '将执行项目构建/测试命令',
      },
      {
        condition: (input: any) => {
          const cmd = (input as any)?.command || ''
          return cmd === 'npm' || cmd === 'git'
        },
        risk: 'medium',
        requireApproval: true,
        reason: '将执行包管理/Git 命令',
      },
      {
        condition: () => true,
        risk: 'high',
        requireApproval: true,
        reason: '将执行受限命令',
      },
    ],
  },
}

/**
 * 检查工具调用是否需要权限审批
 */
export function checkPermissionRequired(toolName: string, input: unknown): PermissionCheckResult {
  const rule = TOOL_PERMISSION_RULES[toolName]

  if (!rule) {
    // 未知工具默认需要审批
    return {
      required: true,
      reason: `未知工具 "${toolName}"，需要审批`,
      riskLevel: 'high',
    }
  }

  // 检查场景
  if (rule.scenarios) {
    for (const scenario of rule.scenarios) {
      try {
        if (scenario.condition(input)) {
          return {
            required: scenario.requireApproval,
            reason: scenario.reason,
            riskLevel: scenario.risk,
          }
        }
      } catch {
        // 场景判断失败，使用默认规则
      }
    }
  }

  return {
    required: rule.defaultRequireApproval,
    riskLevel: rule.defaultRisk,
  }
}

/**
 * 获取工具的风险等级
 */
export function getToolRiskLevel(toolName: string, input?: unknown): ToolRiskLevel {
  const result = checkPermissionRequired(toolName, input)
  return result.riskLevel ?? 'medium'
}

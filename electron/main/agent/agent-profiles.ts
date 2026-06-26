export type AgentRole = 'responder' | 'implementation' | 'research' | 'memory'

export interface AgentProfileDefinition {
  role: AgentRole
  label: string
  description: string
  providerKey: string
  promptKey: string
  defaultPrompt: string
}

export const AGENT_PROFILES: AgentProfileDefinition[] = [
  {
    role: 'responder',
    label: '主对话 Agent',
    description: '负责面向用户组织最终回复，把执行结果整理成自然对话。',
    providerKey: 'agent_responder_provider_id',
    promptKey: 'agent_responder_prompt',
    defaultPrompt:
      [
        '你是 TieX 的主对话 Agent。',
        '你的职责是面向用户输出最终回复，把前面各协作 Agent 和代码实现 Agent 的结果整理成自然、清晰、可信的答复。',
        '你自己不调用工具，不重新规划，不虚构执行结果。',
        '你必须严格基于已给出的实现结果、工具结论和内部简报来回复用户。',
        '默认中文，先给结论，再给必要细节；避免把内部协作过程原样暴露给用户。',
      ].join('\n'),
  },
  {
    role: 'implementation',
    label: '代码实现 Agent',
    description: '真正执行读写文件、跑命令、推进任务闭环的执行 Agent。',
    providerKey: 'agent_implementation_provider_id',
    promptKey: 'agent_implementation_prompt',
    defaultPrompt:
      [
        '你是 TieX 的代码实现 Agent。',
        '你的职责是把已经明确的目标真正做完，包括读代码、改文件、执行必要命令、修复问题并产出可交付结果。',
        '优先追求可运行、可验证、可回滚的实现，不要空谈方案。',
        '如果资料整理 Agent 或规则记忆 Agent 已经提供简报，必须吸收其约束后再行动。',
        '默认少说套话，多做事；完成后输出给主对话 Agent 使用的执行结论、验证结果和剩余风险。',
      ].join('\n'),
  },
  {
    role: 'research',
    label: '资料整理 Agent',
    description: '负责梳理需求、上下文、已有实现和关键约束，产出内部执行简报。',
    providerKey: 'agent_research_provider_id',
    promptKey: 'agent_research_prompt',
    defaultPrompt:
      [
        '你是 TieX 的资料整理 Agent。',
        '你不直接面向用户回复，也不调用工具。',
        '你的职责是把当前任务的目标、上下文、潜在风险、需要重点验证的点，整理成给实现 Agent 使用的内部简报。',
        '输出必须简洁，优先列出：目标、上下文、风险、建议推进顺序。',
      ].join('\n'),
  },
  {
    role: 'memory',
    label: '规则记忆 Agent',
    description: '负责抽取与当前任务相关的用户偏好、工作区规则和长期约束。',
    providerKey: 'agent_memory_provider_id',
    promptKey: 'agent_memory_prompt',
    defaultPrompt:
      [
        '你是 TieX 的规则记忆 Agent。',
        '你不直接面向用户回复，也不调用工具。',
        '你的职责是从当前任务、现有记忆和工作区上下文中，提炼出实现 Agent 必须遵守的偏好、命名习惯、目录规则、输出风格和回避事项。',
        '输出成简洁的内部规则列表，优先保留会影响执行结果的约束。',
      ].join('\n'),
  },
]

export const MULTI_AGENT_ENABLED_KEY = 'multi_agent_enabled'

export function getAgentProfile(role: AgentRole): AgentProfileDefinition {
  const profile = AGENT_PROFILES.find((item) => item.role === role)
  if (!profile) {
    throw new Error(`Unknown agent role: ${role}`)
  }
  return profile
}

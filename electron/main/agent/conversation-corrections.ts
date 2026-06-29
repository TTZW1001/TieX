import type { Message } from '../../shared/types'

export interface ConversationCorrectionSignal {
  deniesPriorAssistantResult: boolean
  urgesExecution: boolean
  confirmsExecution: boolean
  priorAssistantActionClaim: boolean
  shouldPreferImplementation: boolean
  reason: string
  lastAssistantContent?: string
}

const USER_DENIAL_PATTERNS = [
  /你(根本)?没(有)?(改|写|创建|删除|执行|做|保存|覆盖|更新)/,
  /(并没|没有|没)(改|写|创建|删除|执行|做|保存|覆盖|更新|生效|变化)/,
  /(不对|错了|不是这样|不是这个|你说错了|你理解错了|你搞错了)/,
  /(不是让你|我不是要|别按刚才|别这样)/,
  /(请听我的|按我说的做|照我说的做)/,
]

const USER_URGE_PATTERNS = [
  /(继续|接着)(改|写|做|执行|处理|完成|弄)/,
  /(赶紧|马上|现在|直接)(改|写|做|执行|处理|完成|弄)/,
  /(别聊了|不要解释|别解释|少说)(.*)(改|写|做|执行|处理|完成|弄)/,
  /(按这个|按我说的|照这个|照我说的)(改|写|做|执行|处理|完成|弄)?/,
]

const USER_CONFIRM_PATTERNS = [
  /^(继续|继续吧|可以|行|好的|好|开始|开始吧|开写吧|写吧|做吧|执行吧|就这样|就按这个|按这个来)[。！!，,\s]*$/,
  /^(yes|ok|okay|go|continue|do it)$/i,
]

const ASSISTANT_ACTION_PATTERNS = [
  /已(经)?(修改|改好|写入|写好|创建|删除|执行|运行|保存|覆盖|更新|完成|生成)/,
  /(我|这边)(已|已经)(改|写|创建|删除|执行|运行|保存|覆盖|更新|完成|生成)/,
  /(我(会|来|可以|马上|现在|这就)|接下来).*(修改|改|写|创建|删除|执行|运行|保存|覆盖|更新|完成|生成)/,
  /(要我|需要我).*(修改|改|写|创建|删除|执行|运行|保存|覆盖|更新|完成|生成)/,
]

function normalizeText(content: string): string {
  return content.trim().replace(/\s+/g, ' ')
}

function hasAnyPattern(content: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(content))
}

export function analyzeConversationCorrection(
  userContent: string,
  recentMessages: Pick<Message, 'role' | 'content'>[]
): ConversationCorrectionSignal {
  const normalizedUser = normalizeText(userContent)
  const assistantMessages = recentMessages.filter((message) => message.role === 'assistant' && message.content?.trim())
  const lastAssistant = assistantMessages[assistantMessages.length - 1]
  const lastAssistantContent = lastAssistant?.content ? normalizeText(lastAssistant.content) : ''

  const deniesPriorAssistantResult = hasAnyPattern(normalizedUser, USER_DENIAL_PATTERNS)
  const urgesExecution = hasAnyPattern(normalizedUser, USER_URGE_PATTERNS)
  const confirmsExecution = hasAnyPattern(normalizedUser, USER_CONFIRM_PATTERNS)
  const priorAssistantActionClaim = lastAssistantContent
    ? hasAnyPattern(lastAssistantContent, ASSISTANT_ACTION_PATTERNS)
    : false

  const shouldPreferImplementation =
    (deniesPriorAssistantResult && !!lastAssistantContent) ||
    urgesExecution ||
    (confirmsExecution && priorAssistantActionClaim)

  let reason = ''
  if (deniesPriorAssistantResult) {
    reason = '用户正在纠正或否认上一轮执行结果'
  } else if (urgesExecution) {
    reason = '用户正在催促继续执行修改'
  } else if (confirmsExecution && priorAssistantActionClaim) {
    reason = '用户确认继续上一轮 assistant 提议的执行动作'
  }

  return {
    deniesPriorAssistantResult,
    urgesExecution,
    confirmsExecution,
    priorAssistantActionClaim,
    shouldPreferImplementation,
    reason,
    lastAssistantContent: lastAssistantContent || undefined,
  }
}

export function buildCorrectionNotice(signal: ConversationCorrectionSignal): string {
  if (!signal.deniesPriorAssistantResult) {
    return ''
  }

  return [
    '用户刚刚明确否认或纠正了上一轮 assistant 的执行结果。',
    '必须以最新用户纠正为准；上一轮 assistant 中关于“已修改、已写入、已完成、已执行”的结论不能当作事实依据。',
    '如果需要确认真实状态，应通过工具读取/检查；如果没有真实成功的工具结果，不要声称已经完成。',
  ].join('\n')
}

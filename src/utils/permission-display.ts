export type PermissionRiskLevel = string | null | undefined

export interface PermissionDisplayField {
  label: string
  value: string
}

export function getPermissionRiskText(riskLevel: PermissionRiskLevel): string {
  if (riskLevel === 'high') return '高风险'
  if (riskLevel === 'medium') return '中风险'
  if (riskLevel === 'blocked') return '已阻止'
  return '低风险'
}

export function getPermissionRiskClass(riskLevel: PermissionRiskLevel): string {
  if (riskLevel === 'high') return 'high'
  if (riskLevel === 'medium') return 'medium'
  if (riskLevel === 'blocked') return 'blocked'
  return 'low'
}

export function buildPermissionFields(input: {
  reason?: string | null
  target?: string | null
  impactSummary?: string | null
  permissionType?: string | null
}): PermissionDisplayField[] {
  const fields: PermissionDisplayField[] = []
  if (input.reason) fields.push({ label: '原因', value: input.reason })
  if (input.target) fields.push({ label: '目标', value: input.target })
  if (input.impactSummary) fields.push({ label: '影响', value: input.impactSummary })
  if (input.permissionType) fields.push({ label: '类型', value: input.permissionType })
  return fields
}

export function getApprovalScopeText(scope: 'once' | 'conversation'): string {
  if (scope === 'conversation') {
    return '本次会话内允许：后续同类目标可继续执行，适合你已经确认这类操作可信的情况。'
  }
  return '允许一次：只批准当前这一步，后续同类操作仍会再次询问。'
}

export function getManualPlanDraft(input: {
  reason?: string | null
  target?: string | null
  impactSummary?: string | null
  userReason?: string | null
}): string {
  const target = input.target ? `\n目标：${input.target}` : ''
  const reason = input.reason ? `\n原因：${input.reason}` : ''
  const impact = input.impactSummary ? `\n影响：${input.impactSummary}` : ''
  const userReason = input.userReason?.trim() ? `\n我的拒绝原因：${input.userReason.trim()}` : ''
  return `不要直接执行这个操作，我拒绝本次授权。请基于下面信息换一个更安全的方案继续。${target}${reason}${impact}${userReason}`
}

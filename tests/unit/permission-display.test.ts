import { describe, expect, it } from 'vitest'
import {
  buildPermissionFields,
  getManualPlanDraft,
  getPermissionRiskClass,
  getPermissionRiskText,
} from '../../src/utils/permission-display'

describe('permission-display', () => {
  it('maps risk levels to stable labels and classes', () => {
    expect(getPermissionRiskText('high')).toBe('高风险')
    expect(getPermissionRiskClass('high')).toBe('high')
    expect(getPermissionRiskText('blocked')).toBe('已阻止')
    expect(getPermissionRiskClass(undefined)).toBe('low')
  })

  it('builds structured fields without empty values', () => {
    const fields = buildPermissionFields({
      reason: '需要修改配置',
      target: 'src/config.ts',
      impactSummary: null,
      permissionType: 'edit_file',
    })

    expect(fields).toEqual([
      { label: '原因', value: '需要修改配置' },
      { label: '目标', value: 'src/config.ts' },
      { label: '类型', value: 'edit_file' },
    ])
  })

  it('includes user rejection reason in manual plan drafts', () => {
    const draft = getManualPlanDraft({
      reason: '需要执行命令',
      target: 'npm install',
      impactSummary: '会访问网络并修改依赖',
      userReason: '先不要联网',
    })

    expect(draft).toContain('不要直接执行这个操作')
    expect(draft).toContain('目标：npm install')
    expect(draft).toContain('影响：会访问网络并修改依赖')
    expect(draft).toContain('我的拒绝原因：先不要联网')
  })
})

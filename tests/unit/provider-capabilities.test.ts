import { describe, expect, it } from 'vitest'
import {
  getProviderCapabilities,
  getProviderCapabilityBadges,
  getProviderCapabilitySummary,
  supportsMultimodal,
} from '../../src/utils/provider-capabilities'

describe('provider-capabilities', () => {
  it('marks SiliconFlow VL models as attachment capable', () => {
    const capabilities = getProviderCapabilities('siliconflow', 'Qwen/Qwen3-VL-8B-Thinking')

    expect(capabilities.supportsTools).toBe(true)
    expect(capabilities.supportsVision).toBe(true)
    expect(capabilities.supportsAttachments).toBe(true)
    expect(supportsMultimodal('siliconflow', 'Qwen/Qwen3-VL-8B-Thinking')).toBe(true)
  })

  it('keeps DeepSeek text models attachment disabled', () => {
    const capabilities = getProviderCapabilities('deepseek', 'deepseek-v4-flash')

    expect(capabilities.supportsTools).toBe(true)
    expect(capabilities.supportsVision).toBe(false)
    expect(capabilities.supportsAttachments).toBe(false)
    expect(capabilities.notes[0]).toContain('不支持附件')
  })

  it('builds stable badges and summary text', () => {
    const badges = getProviderCapabilityBadges('deepseek', 'deepseek-v4-pro')
    const summary = getProviderCapabilitySummary('deepseek', 'deepseek-v4-pro')

    expect(badges.map((item) => item.label)).toEqual(['工具', '视觉', '附件', '流式'])
    expect(badges.find((item) => item.label === '附件')?.enabled).toBe(false)
    expect(summary).toContain('工具')
    expect(summary).toContain('流式')
    expect(summary).toContain('长上下文')
  })
})

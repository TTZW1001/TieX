export interface ProviderCapabilityInfo {
  supportsTools: boolean
  supportsVision: boolean
  supportsAttachments: boolean
  supportsStreaming: boolean
  contextLabel: string
  notes: string[]
}

export interface ProviderCapabilityBadge {
  key: keyof Pick<ProviderCapabilityInfo, 'supportsTools' | 'supportsVision' | 'supportsAttachments' | 'supportsStreaming'>
  label: string
  enabled: boolean
}

export function getProviderCapabilities(providerType: string, modelName: string): ProviderCapabilityInfo {
  const normalizedType = providerType.toLowerCase()
  const normalizedModel = modelName.toLowerCase()
  const isVisionModel = /\bvl\b|vision|qwen\/qwen2\.5-vl|qwen\/qwen3-vl/.test(normalizedModel)

  if (normalizedType === 'siliconflow') {
    return {
      supportsTools: true,
      supportsVision: isVisionModel,
      supportsAttachments: isVisionModel,
      supportsStreaming: true,
      contextLabel: normalizedModel.includes('qwen3') || normalizedModel.includes('deepseek-v3') ? '长上下文' : '标准上下文',
      notes: isVisionModel
        ? ['适合附件理解、截图分析和普通工具调用。']
        : ['适合文本任务与工具调用；附件上传需要切换到 VL / Vision 模型。'],
    }
  }

  if (normalizedType === 'deepseek') {
    return {
      supportsTools: true,
      supportsVision: false,
      supportsAttachments: false,
      supportsStreaming: true,
      contextLabel: normalizedModel.includes('pro') ? '长上下文' : '标准上下文',
      notes: ['适合文本推理、代码任务和本地工具调用；当前不支持附件输入。'],
    }
  }

  return {
    supportsTools: true,
    supportsVision: false,
    supportsAttachments: false,
    supportsStreaming: true,
    contextLabel: '兼容模式',
    notes: ['OpenAI 兼容服务的能力取决于网关与模型配置；附件能力默认关闭。'],
  }
}

export function supportsMultimodal(providerType: string, modelName: string): boolean {
  return getProviderCapabilities(providerType, modelName).supportsAttachments
}

export function getProviderCapabilityBadges(providerType: string, modelName: string): ProviderCapabilityBadge[] {
  const capabilities = getProviderCapabilities(providerType, modelName)
  return [
    { key: 'supportsTools', label: '工具', enabled: capabilities.supportsTools },
    { key: 'supportsVision', label: '视觉', enabled: capabilities.supportsVision },
    { key: 'supportsAttachments', label: '附件', enabled: capabilities.supportsAttachments },
    { key: 'supportsStreaming', label: '流式', enabled: capabilities.supportsStreaming },
  ]
}

export function getProviderCapabilitySummary(providerType: string, modelName: string): string {
  const capabilities = getProviderCapabilities(providerType, modelName)
  const enabled = getProviderCapabilityBadges(providerType, modelName)
    .filter((item) => item.enabled)
    .map((item) => item.label)
    .join(' / ')
  return `${enabled || '基础文本'} · ${capabilities.contextLabel}`
}

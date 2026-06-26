export interface ProviderCapabilityInfo {
  supportsMultimodal: boolean
}

export function getProviderCapabilities(providerType: string, modelName: string): ProviderCapabilityInfo {
  const normalizedType = providerType.toLowerCase()
  const normalizedModel = modelName.toLowerCase()

  if (normalizedType === 'siliconflow') {
    return {
      supportsMultimodal: /\bvl\b|vision|qwen\/qwen2\.5-vl|qwen\/qwen3-vl/.test(normalizedModel),
    }
  }

  if (normalizedType === 'deepseek') {
    return {
      supportsMultimodal: false,
    }
  }

  return {
    supportsMultimodal: false,
  }
}

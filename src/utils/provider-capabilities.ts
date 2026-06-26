export function supportsMultimodal(providerType: string, modelName: string): boolean {
  const normalizedType = providerType.toLowerCase()
  const normalizedModel = modelName.toLowerCase()

  if (normalizedType === 'siliconflow') {
    return /\bvl\b|vision|qwen\/qwen2\.5-vl|qwen\/qwen3-vl/.test(normalizedModel)
  }

  if (normalizedType === 'deepseek') {
    return false
  }

  return false
}

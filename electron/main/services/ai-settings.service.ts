import { safeStorage } from 'electron'
import type { AiConfig, ConversationAiSettingsVO, EffectiveAiConfig, ModelProvider } from '../../shared/types'
import { AiSettingsRepository, AI_CONFIG_KEYS, rowToAiConfig, type AiOverrideMask } from '../database/repositories/ai-settings.repository'
import { ProviderRepository } from '../database/repositories/provider.repository'
import { ConversationRepository } from '../database/repositories/conversation.repository'
import { SettingsRepository } from '../database/repositories/settings.repository'
import { AGENT_PROFILES, type AgentRole } from '../agent/agent-profiles'
import type { ProviderConfig } from '../providers/model-provider'

const aiSettingsRepo = new AiSettingsRepository()
const providerRepo = new ProviderRepository()
const conversationRepo = new ConversationRepository()
const settingsRepo = new SettingsRepository()

const DEFAULT_AI_CONFIG: AiConfig = {
  providerId: null,
  modelName: null,
  temperature: null,
  topP: null,
  maxTokens: null,
  contextMessageLimit: 20,
  contextTokenLimit: null,
  streamEnabled: true,
  toolsEnabled: true,
  attachmentsEnabled: null,
}

function normalizeNumber(value: unknown, options?: { min?: number; max?: number; integer?: boolean }): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return null
  const normalized = options?.integer ? Math.round(parsed) : parsed
  if (options?.min !== undefined && normalized < options.min) return options.min
  if (options?.max !== undefined && normalized > options.max) return options.max
  return normalized
}

function normalizeBoolean(value: unknown): boolean | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value === 'true' || value === '1'
  return null
}

function sanitizeConfig(input: Partial<AiConfig>): Partial<AiConfig> {
  const result: Partial<AiConfig> = {}
  if ('providerId' in input) result.providerId = input.providerId ? String(input.providerId) : null
  if ('modelName' in input) result.modelName = input.modelName ? String(input.modelName).trim() : null
  if ('temperature' in input) result.temperature = normalizeNumber(input.temperature, { min: 0, max: 2 }) ?? null
  if ('topP' in input) result.topP = normalizeNumber(input.topP, { min: 0, max: 1 }) ?? null
  if ('maxTokens' in input) result.maxTokens = normalizeNumber(input.maxTokens, { min: 1, max: 200000, integer: true }) ?? null
  if ('contextMessageLimit' in input) result.contextMessageLimit = normalizeNumber(input.contextMessageLimit, { min: 1, max: 200, integer: true }) ?? null
  if ('contextTokenLimit' in input) result.contextTokenLimit = normalizeNumber(input.contextTokenLimit, { min: 1000, max: 2000000, integer: true }) ?? null
  if ('streamEnabled' in input) result.streamEnabled = normalizeBoolean(input.streamEnabled) ?? null
  if ('toolsEnabled' in input) result.toolsEnabled = normalizeBoolean(input.toolsEnabled) ?? null
  if ('attachmentsEnabled' in input) result.attachmentsEnabled = normalizeBoolean(input.attachmentsEnabled) ?? null
  return result
}

function toConversationVO(conversationId: string, config: AiConfig, overrideMask: AiOverrideMask, updatedAt: string): ConversationAiSettingsVO {
  return {
    conversationId,
    config,
    overrideMask,
    updatedAt,
  }
}

export class AiSettingsService {
  getDefaultConfig(): AiConfig {
    const preset = aiSettingsRepo.getDefaultPreset()
    const defaultProvider = providerRepo.getDefault()
    return {
      ...DEFAULT_AI_CONFIG,
      providerId: defaultProvider?.id ?? DEFAULT_AI_CONFIG.providerId,
      modelName: defaultProvider?.model_name ?? DEFAULT_AI_CONFIG.modelName,
      temperature: defaultProvider?.temperature ?? DEFAULT_AI_CONFIG.temperature,
      maxTokens: defaultProvider?.max_tokens ?? DEFAULT_AI_CONFIG.maxTokens,
      streamEnabled: defaultProvider ? defaultProvider.stream_enabled !== 0 : DEFAULT_AI_CONFIG.streamEnabled,
      ...(preset ? rowToAiConfig(preset) : {}),
    }
  }

  updateDefaultConfig(input: Partial<AiConfig>): AiConfig {
    const updated = aiSettingsRepo.upsertDefaultPreset(sanitizeConfig(input))
    return {
      ...DEFAULT_AI_CONFIG,
      ...rowToAiConfig(updated),
    }
  }

  getConversationSettings(conversationId: string): ConversationAiSettingsVO | null {
    const { row, mask } = aiSettingsRepo.getConversationSettings(conversationId)
    if (!row) return null
    return toConversationVO(conversationId, rowToAiConfig(row), mask, row.updated_at)
  }

  updateConversationSettings(
    conversationId: string,
    configPatch: Partial<AiConfig>,
    overrideMaskPatch?: AiOverrideMask
  ): ConversationAiSettingsVO {
    const sanitized = sanitizeConfig(configPatch)
    const maskPatch = overrideMaskPatch ?? Object.fromEntries(Object.keys(sanitized).map((key) => [key, true])) as AiOverrideMask
    const row = aiSettingsRepo.upsertConversationSettings(conversationId, sanitized, maskPatch)
    const { mask } = aiSettingsRepo.getConversationSettings(conversationId)
    return toConversationVO(conversationId, rowToAiConfig(row), mask, row.updated_at)
  }

  resetConversationSettings(conversationId: string): void {
    aiSettingsRepo.resetConversationSettings(conversationId)
  }

  getEffectiveConfig(conversationId: string, agentRole?: AgentRole): EffectiveAiConfig {
    const conversation = conversationRepo.getById(conversationId)
    const defaultConfig = this.getDefaultConfig()
    const conversationSettings = aiSettingsRepo.getConversationSettings(conversationId)
    const conversationConfig = rowToAiConfig(conversationSettings.row)
    const mask = conversationSettings.mask

    const source = Object.fromEntries(AI_CONFIG_KEYS.map((key) => [key, 'default'])) as EffectiveAiConfig['source']
    const effective: AiConfig = { ...defaultConfig }

    for (const key of AI_CONFIG_KEYS) {
      if (mask[key]) {
        ;(effective as any)[key] = (conversationConfig as any)[key]
        source[key] = 'conversation'
      }
    }

    if (!mask.providerId && conversation?.provider_id) {
      effective.providerId = conversation.provider_id
      source.providerId = 'conversation'
    }

    const profile = agentRole ? AGENT_PROFILES.find((item) => item.role === agentRole) : null
    const agentProviderId = profile ? (settingsRepo.get(profile.providerKey) ?? '').trim() : ''
    if (agentProviderId) {
      effective.providerId = agentProviderId
      source.providerId = 'agent'
    }

    const provider = effective.providerId ? providerRepo.getById(effective.providerId) : providerRepo.getDefault()
    if (provider) {
      if (!effective.providerId) effective.providerId = provider.id
      if (!effective.modelName) effective.modelName = provider.model_name
    }

    return {
      ...effective,
      provider: provider ? { ...provider, encrypted_api_key: null, has_api_key: provider.encrypted_api_key !== null } as ModelProvider : null,
      source,
    }
  }

  async getProviderConfig(conversationId: string, agentRole?: AgentRole): Promise<ProviderConfig> {
    const effective = this.getEffectiveConfig(conversationId, agentRole)
    const providerId = effective.providerId || effective.provider?.id
    if (!providerId) {
      throw new Error('未配置模型服务商')
    }
    const provider = providerRepo.getById(providerId)
    if (!provider) {
      throw new Error('模型服务商配置不存在')
    }

    let apiKey = ''
    const encrypted = providerRepo.getEncryptedApiKey(providerId)
    if (encrypted) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('系统不支持安全存储')
      }
      apiKey = safeStorage.decryptString(encrypted)
    }

    return {
      id: provider.id,
      name: provider.name,
      providerType: provider.provider_type,
      baseUrl: provider.base_url,
      model: effective.modelName || provider.model_name,
      apiKey,
      temperature: effective.temperature ?? undefined,
      topP: effective.topP ?? undefined,
      maxTokens: effective.maxTokens ?? undefined,
      contextMessageLimit: effective.contextMessageLimit,
      contextTokenLimit: effective.contextTokenLimit,
      timeoutMs: provider.timeout_ms,
      streamEnabled: effective.streamEnabled ?? (provider.stream_enabled !== 0),
      toolsEnabled: effective.toolsEnabled ?? true,
    }
  }
}

import { ProviderRepository } from '../database/repositories/provider.repository'
import { safeStorage } from 'electron'
import type { ModelProvider } from '../../shared/types'
import { getProvider } from '../providers/provider-factory'
import type { ProviderConfig } from '../providers/model-provider'

const providerRepo = new ProviderRepository()

export class ProviderService {
  async createProvider(data: Partial<ModelProvider>): Promise<ModelProvider> {
    const provider = providerRepo.create(data)
    if (data.is_default === 1) {
      providerRepo.setDefault(provider.id)
      return providerRepo.getById(provider.id)!
    }
    return provider
  }

  async listProviders(): Promise<ModelProvider[]> {
    return providerRepo.listAll()
  }

  async getDefaultProvider(): Promise<ModelProvider | null> {
    return providerRepo.getDefault()
  }

  async getProviderById(id: string): Promise<ModelProvider | null> {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid provider id')
    }
    return providerRepo.getById(id)
  }

  async updateProvider(id: string, data: Partial<ModelProvider>): Promise<void> {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid provider id')
    }
    if (data.is_default === 1) {
      providerRepo.setDefault(id)
      const { is_default, ...rest } = data
      if (Object.keys(rest).length > 0) {
        providerRepo.update(id, rest)
      }
      return
    }
    providerRepo.update(id, data)
  }

  async deleteProvider(id: string): Promise<void> {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid provider id')
    }
    const providers = providerRepo.listAll()
    if (providers.length <= 1) {
      throw new Error('至少需要保留一个 Provider')
    }
    const provider = providerRepo.getById(id)
    if (!provider) {
      throw new Error('模型服务商配置不存在')
    }
    const wasDefault = provider.is_default === 1
    providerRepo.softDelete(id)
    if (wasDefault) {
      const nextProvider = providerRepo.listAll()[0]
      if (nextProvider) {
        providerRepo.setDefault(nextProvider.id)
      }
    }
  }

  async setApiKey(id: string, apiKey: string): Promise<void> {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid provider id')
    }
    if (!apiKey || typeof apiKey !== 'string') {
      throw new Error('Invalid API key')
    }
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Safe storage is not available on this system')
    }
    const encrypted = safeStorage.encryptString(apiKey)
    providerRepo.setEncryptedApiKey(id, encrypted)
  }

  async getApiKey(id: string): Promise<string | null> {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid provider id')
    }
    const encrypted = providerRepo.getEncryptedApiKey(id)
    if (!encrypted) return null
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Safe storage is not available on this system')
    }
    return safeStorage.decryptString(encrypted)
  }

  async testConnection(id: string): Promise<{ success: boolean; message: string }> {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid provider id')
    }

    const provider = providerRepo.getById(id)
    if (!provider) {
      return { success: false, message: '模型服务商配置不存在' }
    }

    // 解密 API Key
    let apiKey = ''
    const encrypted = providerRepo.getEncryptedApiKey(id)
    if (encrypted) {
      if (!safeStorage.isEncryptionAvailable()) {
        return { success: false, message: '系统不支持安全存储' }
      }
      apiKey = safeStorage.decryptString(encrypted)
    }

    const config: ProviderConfig = {
      id: provider.id,
      name: provider.name,
      providerType: provider.provider_type,
      baseUrl: provider.base_url,
      model: provider.model_name,
      apiKey,
      temperature: provider.temperature ?? undefined,
      maxTokens: provider.max_tokens ?? undefined,
      timeoutMs: provider.timeout_ms,
    }

    return getProvider(config.providerType).testConnection(config)
  }

  async testConnectionDraft(data: {
    providerId?: string | null
    providerType?: string
    name?: string
    baseUrl: string
    modelName: string
    apiKey?: string
    timeoutMs?: number
  }): Promise<{ success: boolean; message: string }> {
    if (!data.baseUrl || !data.modelName) {
      return { success: false, message: '请先填写 Base URL 和模型名称' }
    }

    let apiKey = data.apiKey?.trim() ?? ''
    if ((!apiKey || apiKey === '••••••••') && data.providerId) {
      const encrypted = providerRepo.getEncryptedApiKey(data.providerId)
      if (encrypted) {
        if (!safeStorage.isEncryptionAvailable()) {
          return { success: false, message: '系统不支持安全存储' }
        }
        apiKey = safeStorage.decryptString(encrypted)
      }
    }

    const config: ProviderConfig = {
      id: data.providerId ?? 'draft-provider',
      name: data.name?.trim() || 'DeepSeek',
      providerType: data.providerType?.trim() || 'deepseek',
      baseUrl: data.baseUrl.trim(),
      model: data.modelName.trim(),
      apiKey,
      timeoutMs: data.timeoutMs && data.timeoutMs > 0 ? data.timeoutMs : 60000,
    }

    return getProvider(config.providerType).testConnection(config)
  }
}

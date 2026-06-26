import { ipcMain } from 'electron'
import {
  IPC_PROVIDER_GET_DEFAULT,
  IPC_PROVIDER_LIST,
  IPC_PROVIDER_GET_BY_ID,
  IPC_PROVIDER_CREATE,
  IPC_PROVIDER_UPDATE,
  IPC_PROVIDER_DELETE,
  IPC_PROVIDER_TEST_CONNECTION,
  IPC_PROVIDER_TEST_DRAFT,
} from '../../shared/ipc'
import { ProviderService } from '../services/provider.service'

const providerService = new ProviderService()

export function registerProviderIpc(): void {
  ipcMain.handle(IPC_PROVIDER_LIST, async () => {
    const providers = await providerService.listProviders()
    return providers.map((provider) => ({
      ...provider,
      encrypted_api_key: null,
      has_api_key: provider.encrypted_api_key !== null,
    }))
  })

  ipcMain.handle(IPC_PROVIDER_GET_DEFAULT, async () => {
    const provider = await providerService.getDefaultProvider()
    if (!provider) return null
    // 不返回加密的 API Key 给渲染进程
    return {
      ...provider,
      encrypted_api_key: null,
      has_api_key: provider.encrypted_api_key !== null,
    }
  })

  ipcMain.handle(IPC_PROVIDER_GET_BY_ID, async (_event, id: string) => {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid provider id')
    }
    const provider = await providerService.getProviderById(id)
    if (!provider) return null
    return {
      ...provider,
      encrypted_api_key: null,
      has_api_key: provider.encrypted_api_key !== null,
    }
  })

  ipcMain.handle(IPC_PROVIDER_CREATE, async (_event, data: Record<string, unknown>) => {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid provider data')
    }
    const provider = await providerService.createProvider({
      name: typeof data.name === 'string' ? data.name : '新 Provider',
      provider_type: typeof data.provider_type === 'string' ? data.provider_type : 'deepseek',
      base_url: typeof data.base_url === 'string' ? data.base_url : 'https://api.deepseek.com',
      model_name: typeof data.model_name === 'string' ? data.model_name : 'deepseek-v4-flash',
      timeout_ms: typeof data.timeout_ms === 'number' ? data.timeout_ms : 60000,
      stream_enabled: typeof data.stream_enabled === 'number' ? data.stream_enabled : 1,
      is_default: typeof data.is_default === 'number' ? data.is_default : 0,
      is_enabled: typeof data.is_enabled === 'number' ? data.is_enabled : 1,
    } as any)
    return {
      ...provider,
      encrypted_api_key: null,
      has_api_key: provider.encrypted_api_key !== null,
    }
  })

  ipcMain.handle(
    IPC_PROVIDER_UPDATE,
    async (_event, id: string, data: Record<string, unknown>) => {
      if (!id || typeof id !== 'string') {
        throw new Error('Invalid provider id')
      }
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid provider data')
      }
      // 如果包含 api_key，单独处理加密
      if (data.api_key && typeof data.api_key === 'string') {
        await providerService.setApiKey(id, data.api_key as string)
        const { api_key, ...rest } = data
        if (Object.keys(rest).length > 0) {
          await providerService.updateProvider(id, rest as any)
        }
      } else {
        await providerService.updateProvider(id, data as any)
      }
    }
  )

  ipcMain.handle(IPC_PROVIDER_DELETE, async (_event, id: string) => {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid provider id')
    }
    await providerService.deleteProvider(id)
  })

  ipcMain.handle(IPC_PROVIDER_TEST_CONNECTION, async (_event, id: string) => {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid provider id')
    }
    return providerService.testConnection(id)
  })

  ipcMain.handle(IPC_PROVIDER_TEST_DRAFT, async (_event, data: Record<string, unknown>) => {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid provider draft')
    }
    return providerService.testConnectionDraft({
      providerId: typeof data.providerId === 'string' ? data.providerId : null,
      providerType: typeof data.providerType === 'string' ? data.providerType : 'deepseek',
      name: typeof data.name === 'string' ? data.name : 'DeepSeek',
      baseUrl: typeof data.baseUrl === 'string' ? data.baseUrl : '',
      modelName: typeof data.modelName === 'string' ? data.modelName : '',
      apiKey: typeof data.apiKey === 'string' ? data.apiKey : '',
      timeoutMs: typeof data.timeoutMs === 'number' ? data.timeoutMs : undefined,
    })
  })
}

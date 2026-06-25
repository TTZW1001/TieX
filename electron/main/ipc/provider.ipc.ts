import { ipcMain } from 'electron'
import {
  IPC_PROVIDER_GET_DEFAULT,
  IPC_PROVIDER_GET_BY_ID,
  IPC_PROVIDER_UPDATE,
  IPC_PROVIDER_TEST_CONNECTION,
  IPC_PROVIDER_TEST_DRAFT,
} from '../../shared/ipc'
import { ProviderService } from '../services/provider.service'

const providerService = new ProviderService()

export function registerProviderIpc(): void {
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
    })
  })
}

import { defineStore } from 'pinia'
import { ref } from 'vue'

const API_KEY_MASK = '••••••••'
const DEFAULT_PROVIDER_ID = 'default-deepseek'
const DEFAULT_PROVIDER_NAME = 'DeepSeek'
const DEFAULT_PROVIDER_TYPE = 'deepseek'
const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_MODEL_NAME = 'deepseek-v4-flash'

export const useSettingsStore = defineStore('settings', () => {
  const provider = ref(DEFAULT_PROVIDER_NAME)
  const modelName = ref(DEFAULT_MODEL_NAME)
  const baseUrl = ref(DEFAULT_BASE_URL)
  const apiKey = ref('')
  const hasApiKey = ref(false)

  const confirmBeforeModify = ref(true)
  const confirmBeforeCommand = ref(true)
  const autoBackup = ref(true)
  const allowOutsideWorkspace = ref(false)

  const theme = ref<'system' | 'light' | 'dark'>('system')
  const defaultSidebar = ref<'expanded' | 'collapsed'>('expanded')

  const dataDirectory = ref('加载中...')

  const providerId = ref<string | null>(DEFAULT_PROVIDER_ID)

  async function loadFromDb() {
    if (!window.tiex) return

    try {
      // 加载设置
      const allSettings = await window.tiex.settings.getAll()
      if (allSettings.theme) theme.value = allSettings.theme as 'system' | 'light' | 'dark'
      if (allSettings.sidebar_collapsed) {
        defaultSidebar.value = allSettings.sidebar_collapsed === 'true' ? 'collapsed' : 'expanded'
      }
      if (allSettings.confirm_before_modify !== undefined) {
        confirmBeforeModify.value = allSettings.confirm_before_modify === 'true'
      }
      if (allSettings.confirm_before_command !== undefined) {
        confirmBeforeCommand.value = allSettings.confirm_before_command === 'true'
      }
      if (allSettings.auto_backup !== undefined) {
        autoBackup.value = allSettings.auto_backup === 'true'
      }
      if (allSettings.allow_outside_workspace !== undefined) {
        allowOutsideWorkspace.value = allSettings.allow_outside_workspace === 'true'
      }
      dataDirectory.value = await window.tiex.settings.getDataDirectory()

      // 加载默认提供者
      const providerInfo = await window.tiex.provider.getDefault()
      if (providerInfo) {
        providerId.value = providerInfo.id
        provider.value = providerInfo.name
        modelName.value = providerInfo.model_name
        baseUrl.value = providerInfo.base_url
        hasApiKey.value = providerInfo.has_api_key
        if (providerInfo.has_api_key) {
          apiKey.value = API_KEY_MASK
        }
      } else {
        providerId.value = DEFAULT_PROVIDER_ID
        provider.value = DEFAULT_PROVIDER_NAME
        modelName.value = DEFAULT_MODEL_NAME
        baseUrl.value = DEFAULT_BASE_URL
        hasApiKey.value = false
        apiKey.value = ''
      }
    } catch (err) {
      console.error('Failed to load settings from database:', err)
    }
  }

  async function testConnection(): Promise<{ success: boolean; message: string }> {
    if (!window.tiex) {
      return { success: false, message: '未配置提供者' }
    }

    return window.tiex.provider.testDraft({
      providerId: providerId.value,
      providerType: DEFAULT_PROVIDER_TYPE,
      name: provider.value,
      baseUrl: baseUrl.value,
      modelName: modelName.value,
      apiKey: apiKey.value,
    })
  }

  async function saveConfig(): Promise<{ success: boolean; message: string }> {
    if (!window.tiex) {
      return { success: false, message: 'IPC 不可用，无法保存配置' }
    }

    try {
      const effectiveProviderId = providerId.value || DEFAULT_PROVIDER_ID
      providerId.value = effectiveProviderId

      // 保存提供者配置
      const updateData: Record<string, unknown> = {
        name: provider.value,
        provider_type: DEFAULT_PROVIDER_TYPE,
        model_name: modelName.value.trim(),
        base_url: baseUrl.value.trim(),
      }
      // 只有当 API Key 不是掩码时才保存
      if (apiKey.value && apiKey.value !== API_KEY_MASK) {
        updateData.api_key = apiKey.value.trim()
      }
      await window.tiex.provider.update(effectiveProviderId, updateData)
      if (updateData.api_key) {
        hasApiKey.value = true
        apiKey.value = API_KEY_MASK
      }

      // 保存设置
      await window.tiex.settings.update('confirm_before_modify', confirmBeforeModify.value ? 'true' : 'false')
      await window.tiex.settings.update('confirm_before_command', confirmBeforeCommand.value ? 'true' : 'false')
      await window.tiex.settings.update('auto_backup', autoBackup.value ? 'true' : 'false')
      await window.tiex.settings.update('allow_outside_workspace', allowOutsideWorkspace.value ? 'true' : 'false')
      await window.tiex.settings.update('sidebar_collapsed', defaultSidebar.value === 'collapsed' ? 'true' : 'false')
      await window.tiex.settings.update('theme', theme.value)
      return { success: true, message: '配置已保存' }
    } catch (err) {
      console.error('Failed to save settings:', err)
      return { success: false, message: (err as Error).message || '保存配置失败' }
    }
  }

  return {
    provider,
    modelName,
    baseUrl,
    apiKey,
    hasApiKey,
    confirmBeforeModify,
    confirmBeforeCommand,
    autoBackup,
    allowOutsideWorkspace,
    theme,
    defaultSidebar,
    dataDirectory,
    providerId,
    loadFromDb,
    testConnection,
    saveConfig,
  }
})

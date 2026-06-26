import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { MemoryCandidateInfo, ProviderInfo, StatsOverviewInfo } from '@/types/global'
import { AGENT_PROFILES, MULTI_AGENT_ENABLED_KEY, type AgentRole } from '@/constants/agent-profiles'

const API_KEY_MASK = '••••••••'
const DEFAULT_PROVIDER_ID = 'default-deepseek'
const DEFAULT_PROVIDER_NAME = 'DeepSeek'
const DEFAULT_PROVIDER_TYPE = 'deepseek'
const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_MODEL_NAME = 'deepseek-v4-flash'
const DEFAULT_TIMEOUT_MS = 60000

export const useSettingsStore = defineStore('settings', () => {
  const providers = ref<ProviderInfo[]>([])
  const provider = ref(DEFAULT_PROVIDER_NAME)
  const providerType = ref(DEFAULT_PROVIDER_TYPE)
  const modelName = ref(DEFAULT_MODEL_NAME)
  const baseUrl = ref(DEFAULT_BASE_URL)
  const apiKey = ref('')
  const hasApiKey = ref(false)
  const providerTimeoutMs = ref(DEFAULT_TIMEOUT_MS)
  const streamEnabled = ref(true)

  const confirmBeforeModify = ref(true)
  const confirmBeforeCommand = ref(true)
  const autoBackup = ref(true)
  const defaultPermissionMode = ref<'read' | 'execute' | 'command'>('read')
  const maxTaskSteps = ref(20)
  const defaultCommandTimeoutMs = ref(DEFAULT_TIMEOUT_MS)

  const theme = ref<'system' | 'light' | 'dark'>('system')
  const defaultSidebar = ref<'expanded' | 'collapsed'>('expanded')

  const dataDirectory = ref('加载中...')
  const userDisplayName = ref('')
  const userPreferences = ref('')
  const globalMemory = ref('')
  const customSystemPrompt = ref('')
  const memoryCandidates = ref<MemoryCandidateInfo[]>([])
  const statsOverview = ref<StatsOverviewInfo | null>(null)

  const providerId = ref<string | null>(DEFAULT_PROVIDER_ID)
  const multiAgentEnabled = ref(true)
  const agentProviderBindings = ref<Record<AgentRole, string | null>>({
    responder: null,
    implementation: null,
    research: null,
    memory: null,
  })
  const agentPrompts = ref<Record<AgentRole, string>>({
    responder: AGENT_PROFILES.find((item) => item.role === 'responder')!.defaultPrompt,
    implementation: AGENT_PROFILES.find((item) => item.role === 'implementation')!.defaultPrompt,
    research: AGENT_PROFILES.find((item) => item.role === 'research')!.defaultPrompt,
    memory: AGENT_PROFILES.find((item) => item.role === 'memory')!.defaultPrompt,
  })

  async function loadProviders() {
    if (!window.tiex) return
    providers.value = await window.tiex.provider.list()
  }

  async function loadMemoryCandidates() {
    if (!window.tiex) return
    memoryCandidates.value = await window.tiex.memory.getCandidates('pending')
  }

  async function loadStatsOverview() {
    if (!window.tiex?.stats) return
    statsOverview.value = await window.tiex.stats.getOverview()
  }

  async function selectProviderById(id: string | null) {
    if (!window.tiex || !id) return
    const providerInfo = await window.tiex.provider.getById(id)
    if (!providerInfo) return
    providerId.value = providerInfo.id
    provider.value = providerInfo.name
    providerType.value = providerInfo.provider_type
    modelName.value = providerInfo.model_name
    baseUrl.value = providerInfo.base_url
    hasApiKey.value = providerInfo.has_api_key
    providerTimeoutMs.value = providerInfo.timeout_ms || DEFAULT_TIMEOUT_MS
    streamEnabled.value = providerInfo.stream_enabled === 1
    apiKey.value = providerInfo.has_api_key ? API_KEY_MASK : ''
  }

  async function loadFromDb() {
    if (!window.tiex) return

    try {
      await loadProviders()
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
      if (allSettings.default_permission_mode && ['read', 'execute', 'command'].includes(allSettings.default_permission_mode)) {
        defaultPermissionMode.value = allSettings.default_permission_mode as 'read' | 'execute' | 'command'
      }
      if (allSettings.max_task_steps !== undefined) {
        const parsed = Number.parseInt(allSettings.max_task_steps, 10)
        if (Number.isFinite(parsed)) {
          maxTaskSteps.value = parsed
        }
      }
      if (allSettings.default_command_timeout_ms !== undefined) {
        const parsed = Number.parseInt(allSettings.default_command_timeout_ms, 10)
        if (Number.isFinite(parsed)) {
          defaultCommandTimeoutMs.value = parsed
        }
      }
      multiAgentEnabled.value = (allSettings[MULTI_AGENT_ENABLED_KEY] ?? 'true') === 'true'
      for (const profile of AGENT_PROFILES) {
        const providerRaw = allSettings[profile.providerKey] ?? ''
        agentProviderBindings.value[profile.role] = providerRaw.trim() || null
        agentPrompts.value[profile.role] = allSettings[profile.promptKey] ?? profile.defaultPrompt
      }
      userDisplayName.value = allSettings.user_display_name ?? ''
      userPreferences.value = allSettings.user_preferences ?? ''
      globalMemory.value = allSettings.global_memory ?? ''
      customSystemPrompt.value = allSettings.custom_system_prompt ?? ''
      dataDirectory.value = await window.tiex.settings.getDataDirectory()

      // 加载默认提供者
      const providerInfo = await window.tiex.provider.getDefault()
      if (providerInfo) {
        await selectProviderById(providerInfo.id)
      } else {
        providerId.value = DEFAULT_PROVIDER_ID
        provider.value = DEFAULT_PROVIDER_NAME
        providerType.value = DEFAULT_PROVIDER_TYPE
        modelName.value = DEFAULT_MODEL_NAME
        baseUrl.value = DEFAULT_BASE_URL
        hasApiKey.value = false
        apiKey.value = ''
        providerTimeoutMs.value = DEFAULT_TIMEOUT_MS
        streamEnabled.value = true
      }
      await loadMemoryCandidates()
      await loadStatsOverview()
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
      providerType: providerType.value,
      name: provider.value,
      baseUrl: baseUrl.value,
      modelName: modelName.value,
      apiKey: apiKey.value,
      timeoutMs: providerTimeoutMs.value,
    })
  }

  async function saveTaskPermissionSettings(): Promise<void> {
    if (!window.tiex) return
    await window.tiex.settings.update('confirm_before_modify', confirmBeforeModify.value ? 'true' : 'false')
    await window.tiex.settings.update('confirm_before_command', confirmBeforeCommand.value ? 'true' : 'false')
    await window.tiex.settings.update('auto_backup', autoBackup.value ? 'true' : 'false')
    await window.tiex.settings.update('default_permission_mode', defaultPermissionMode.value)
    await window.tiex.settings.update('max_task_steps', String(maxTaskSteps.value))
    await window.tiex.settings.update('default_command_timeout_ms', String(defaultCommandTimeoutMs.value))
    await window.tiex.settings.update('sidebar_collapsed', defaultSidebar.value === 'collapsed' ? 'true' : 'false')
  }

  async function saveMemorySettings(): Promise<void> {
    if (!window.tiex) return
    await window.tiex.settings.update('user_display_name', userDisplayName.value.trim())
    await window.tiex.settings.update('user_preferences', userPreferences.value.trim())
    await window.tiex.memory.setGlobal(globalMemory.value.trim())
    await window.tiex.settings.update('custom_system_prompt', customSystemPrompt.value)
  }

  async function saveAgentSettings(): Promise<void> {
    if (!window.tiex) return
    await window.tiex.settings.update(MULTI_AGENT_ENABLED_KEY, multiAgentEnabled.value ? 'true' : 'false')
    for (const profile of AGENT_PROFILES) {
      await window.tiex.settings.update(profile.providerKey, agentProviderBindings.value[profile.role] ?? '')
      await window.tiex.settings.update(profile.promptKey, agentPrompts.value[profile.role])
    }
  }

  function restoreAgentDefaults(): void {
    multiAgentEnabled.value = true
    for (const profile of AGENT_PROFILES) {
      agentProviderBindings.value[profile.role] = null
      agentPrompts.value[profile.role] = profile.defaultPrompt
    }
  }

  async function approveMemoryCandidate(candidateId: string): Promise<void> {
    if (!window.tiex) return
    await window.tiex.memory.approveCandidate(candidateId)
    await loadFromDb()
  }

  async function rejectMemoryCandidate(candidateId: string): Promise<void> {
    if (!window.tiex) return
    await window.tiex.memory.rejectCandidate(candidateId)
    await loadMemoryCandidates()
  }

  async function saveProviderSettings(): Promise<void> {
    if (!window.tiex) return
    const effectiveProviderId = providerId.value || DEFAULT_PROVIDER_ID
    providerId.value = effectiveProviderId

    const updateData: Record<string, unknown> = {
      name: provider.value,
      provider_type: providerType.value,
      model_name: modelName.value.trim(),
      base_url: baseUrl.value.trim(),
      timeout_ms: providerTimeoutMs.value,
      stream_enabled: streamEnabled.value ? 1 : 0,
      is_default: 1,
    }
    if (apiKey.value && apiKey.value !== API_KEY_MASK) {
      updateData.api_key = apiKey.value.trim()
    }
    await window.tiex.provider.update(effectiveProviderId, updateData)
    if (updateData.api_key) {
      hasApiKey.value = true
      apiKey.value = API_KEY_MASK
    }
    await loadProviders()
  }

  async function createProvider(data?: Partial<ProviderInfo>): Promise<ProviderInfo | null> {
    if (!window.tiex) return null
    const created = await window.tiex.provider.create({
      name: data?.name ?? '新 Provider',
      provider_type: data?.provider_type ?? 'deepseek',
      base_url: data?.base_url ?? 'https://api.deepseek.com',
      model_name: data?.model_name ?? 'deepseek-v4-flash',
      timeout_ms: data?.timeout_ms ?? DEFAULT_TIMEOUT_MS,
      stream_enabled: data?.stream_enabled ?? 1,
      is_default: data?.is_default ?? 0,
      is_enabled: data?.is_enabled ?? 1,
    })
    await loadProviders()
    await selectProviderById(created.id)
    return created
  }

  async function deleteProvider(id: string): Promise<void> {
    if (!window.tiex) return
    await window.tiex.provider.delete(id)
    await loadProviders()
    const defaultProvider = await window.tiex.provider.getDefault()
    if (defaultProvider) {
      await selectProviderById(defaultProvider.id)
    }
  }

  async function saveConfig(): Promise<{ success: boolean; message: string }> {
    if (!window.tiex) {
      return { success: false, message: 'IPC 不可用，无法保存配置' }
    }

    try {
      await saveProviderSettings()
      await saveTaskPermissionSettings()
      await window.tiex.settings.update('theme', theme.value)
      await saveMemorySettings()
      return { success: true, message: '配置已保存' }
    } catch (err) {
      console.error('Failed to save settings:', err)
      return { success: false, message: (err as Error).message || '保存配置失败' }
    }
  }

  return {
    providers,
    provider,
    providerType,
    modelName,
    baseUrl,
    apiKey,
    hasApiKey,
    providerTimeoutMs,
    streamEnabled,
    confirmBeforeModify,
    confirmBeforeCommand,
    autoBackup,
    defaultPermissionMode,
    maxTaskSteps,
    defaultCommandTimeoutMs,
    theme,
    defaultSidebar,
    dataDirectory,
    userDisplayName,
    userPreferences,
    globalMemory,
    customSystemPrompt,
    memoryCandidates,
    statsOverview,
    providerId,
    multiAgentEnabled,
    agentProviderBindings,
    agentPrompts,
    loadProviders,
    loadMemoryCandidates,
    loadStatsOverview,
    selectProviderById,
    loadFromDb,
    testConnection,
    saveProviderSettings,
    createProvider,
    deleteProvider,
    saveTaskPermissionSettings,
    saveMemorySettings,
    saveAgentSettings,
    restoreAgentDefaults,
    approveMemoryCandidate,
    rejectMemoryCandidate,
    saveConfig,
  }
})

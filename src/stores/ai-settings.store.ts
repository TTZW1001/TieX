import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { AiConfigInfo, ConversationAiSettingsInfo, EffectiveAiConfigInfo } from '@/types/global'

export const AI_CONFIG_KEYS: Array<keyof AiConfigInfo> = [
  'providerId',
  'modelName',
  'temperature',
  'topP',
  'maxTokens',
  'contextMessageLimit',
  'contextTokenLimit',
  'streamEnabled',
  'toolsEnabled',
  'attachmentsEnabled',
]

export const DEFAULT_AI_CONFIG: AiConfigInfo = {
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

function cloneConfig(config: AiConfigInfo): AiConfigInfo {
  return { ...config }
}

export const useAiSettingsStore = defineStore('aiSettings', () => {
  const defaultConfig = ref<AiConfigInfo>(cloneConfig(DEFAULT_AI_CONFIG))
  const conversationSettings = ref<Record<string, ConversationAiSettingsInfo | null>>({})
  const effectiveConfigs = ref<Record<string, EffectiveAiConfigInfo | null>>({})

  const loaded = ref(false)
  const saving = ref(false)

  const hasDefaultProvider = computed(() => !!defaultConfig.value.providerId)

  async function loadDefault(): Promise<void> {
    if (!window.tiex?.aiSettings) return
    defaultConfig.value = await window.tiex.aiSettings.getDefault()
    loaded.value = true
  }

  async function saveDefault(patch?: Partial<AiConfigInfo>): Promise<void> {
    if (!window.tiex?.aiSettings) return
    saving.value = true
    try {
      defaultConfig.value = await window.tiex.aiSettings.updateDefault(patch ?? defaultConfig.value)
      await refreshLoadedEffectiveConfigs()
    } finally {
      saving.value = false
    }
  }

  async function loadConversation(conversationId: string): Promise<void> {
    if (!window.tiex?.aiSettings || !conversationId) return
    conversationSettings.value[conversationId] = await window.tiex.aiSettings.getConversation(conversationId)
    effectiveConfigs.value[conversationId] = await window.tiex.aiSettings.getEffective(conversationId)
  }

  async function setConversationOverride(
    conversationId: string,
    configPatch: Partial<AiConfigInfo>,
    overrideMaskPatch?: Partial<Record<keyof AiConfigInfo, boolean>>
  ): Promise<void> {
    if (!window.tiex?.aiSettings || !conversationId) return
    const saved = await window.tiex.aiSettings.updateConversation(conversationId, configPatch, overrideMaskPatch)
    conversationSettings.value[conversationId] = saved
    effectiveConfigs.value[conversationId] = await window.tiex.aiSettings.getEffective(conversationId)
  }

  async function inheritConversationField(conversationId: string, field: keyof AiConfigInfo): Promise<void> {
    const current = conversationSettings.value[conversationId]?.config ?? cloneConfig(DEFAULT_AI_CONFIG)
    await setConversationOverride(conversationId, { [field]: current[field] } as Partial<AiConfigInfo>, { [field]: false } as any)
  }

  async function resetConversation(conversationId: string): Promise<void> {
    if (!window.tiex?.aiSettings || !conversationId) return
    await window.tiex.aiSettings.resetConversation(conversationId)
    conversationSettings.value[conversationId] = null
    effectiveConfigs.value[conversationId] = await window.tiex.aiSettings.getEffective(conversationId)
  }

  async function refreshLoadedEffectiveConfigs(): Promise<void> {
    if (!window.tiex?.aiSettings) return
    const conversationIds = Object.keys(effectiveConfigs.value)
    await Promise.all(
      conversationIds.map(async (conversationId) => {
        effectiveConfigs.value[conversationId] = await window.tiex.aiSettings.getEffective(conversationId)
      })
    )
  }

  function getConversationSettings(conversationId: string | null): ConversationAiSettingsInfo | null {
    if (!conversationId) return null
    return conversationSettings.value[conversationId] ?? null
  }

  function getEffectiveConfig(conversationId: string | null): EffectiveAiConfigInfo | null {
    if (!conversationId) return null
    return effectiveConfigs.value[conversationId] ?? null
  }

  function isOverridden(conversationId: string | null, field: keyof AiConfigInfo): boolean {
    if (!conversationId) return false
    return Boolean(conversationSettings.value[conversationId]?.overrideMask?.[field])
  }

  return {
    defaultConfig,
    conversationSettings,
    effectiveConfigs,
    loaded,
    saving,
    hasDefaultProvider,
    loadDefault,
    saveDefault,
    loadConversation,
    setConversationOverride,
    inheritConversationField,
    resetConversation,
    refreshLoadedEffectiveConfigs,
    getConversationSettings,
    getEffectiveConfig,
    isOverridden,
  }
})

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSettingsStore } from '@/stores/settings.store'
import { useAiSettingsStore } from '@/stores/ai-settings.store'
import { useSkillsStore } from '@/stores/skills.store'
import { useUiStore } from '@/stores/ui.store'
import UsageDonutChart from '@/components/UsageDonutChart.vue'
import TokenSeriesChart from '@/components/TokenSeriesChart.vue'
import {
  getProviderCapabilities,
  getProviderCapabilityBadges,
  getProviderCapabilitySummary,
} from '@/utils/provider-capabilities'

const route = useRoute()
const router = useRouter()
const settingsStore = useSettingsStore()
const aiSettingsStore = useAiSettingsStore()
const skillsStore = useSkillsStore()
const uiStore = useUiStore()
const testResult = ref<string | null>(null)
const saveResult = ref<string | null>(null)
const testSuccess = ref<boolean | null>(null)
const saveSuccess = ref<boolean | null>(null)
const statsRange = ref<'hour' | 'day' | 'week' | 'month'>('day')
let feedbackTimer: ReturnType<typeof setTimeout> | null = null

const sections = {
  provider: {
    title: '模型服务',
    intro: '维护 Provider、模型和连接方式。',
  },
  ai: {
    title: '默认 AI',
    intro: '设置新会话默认继承的模型请求参数。',
  },
  permissions: {
    title: '任务与权限',
    intro: '控制默认权限边界、任务轮次和命令行为。',
  },
  agents: {
    title: '多 Agent',
    intro: '给不同分工的 Agent 指定模型和运行提示词。',
  },
  memory: {
    title: '记忆与偏好',
    intro: '管理称呼、偏好和待确认记忆。',
  },
  skills: {
    title: 'Skills 管理',
    intro: '扫描、启用和管理本地安装的 Skills。',
  },
  data: {
    title: '本地数据',
    intro: '查看数据库、缓存和日志保存在什么位置。',
  },
  stats: {
    title: '使用统计',
    intro: '查看工作区规模、消息量和 token 趋势。',
  },
} as const

type SettingsSectionId = keyof typeof sections
const sectionOrder: SettingsSectionId[] = ['provider', 'ai', 'permissions', 'agents', 'memory', 'skills', 'data', 'stats']

const activeSection = computed<SettingsSectionId>(() => {
  const raw = String(route.params.section ?? 'provider') as SettingsSectionId
  if (!sectionOrder.includes(raw)) {
    return 'provider'
  }
  if (raw === 'stats' && !settingsStore.statsOverview) {
    return 'provider'
  }
  return raw
})

const activeMeta = computed(() => sections[activeSection.value])

const modelOptions = computed(() => {
  if (settingsStore.providerType === 'siliconflow') {
    return [
      'Qwen/Qwen3-VL-8B-Thinking',
      'Qwen/Qwen2.5-VL-72B-Instruct',
      'deepseek-ai/DeepSeek-V3',
    ]
  }
  return ['deepseek-v4-flash', 'deepseek-v4-pro']
})

const activeProviderCapabilities = computed(() => {
  return getProviderCapabilities(settingsStore.providerType, settingsStore.modelName)
})

const activeProviderCapabilityBadges = computed(() => {
  return getProviderCapabilityBadges(settingsStore.providerType, settingsStore.modelName)
})

function providerCapabilityBadges(providerType: string, modelName: string) {
  return getProviderCapabilityBadges(providerType, modelName)
}

function providerCapabilitySummary(providerType: string, modelName: string) {
  return getProviderCapabilitySummary(providerType, modelName)
}

const activeStatsSeries = computed(() => {
  return settingsStore.statsOverview?.token_series?.[statsRange.value] ?? []
})

const aiDefaultProvider = computed(() => {
  return settingsStore.providers.find((item) => item.id === aiSettingsStore.defaultConfig.providerId) ?? null
})

const aiDefaultModelLabel = computed(() => {
  const provider = aiDefaultProvider.value
  if (!provider) return '未选择默认模型'
  return `${provider.name} · ${aiSettingsStore.defaultConfig.modelName || provider.model_name}`
})

watch(
  () => route.params.section,
  (section) => {
    const normalized = String(section ?? 'provider')
    const invalidSection = !sectionOrder.includes(normalized as SettingsSectionId)
    const hiddenStats = normalized === 'stats' && !settingsStore.statsOverview
    if (invalidSection || hiddenStats) {
      router.replace({ name: 'settings', params: { section: 'provider' } })
    }
  },
  { immediate: true }
)

async function testConnection() {
  const result = await settingsStore.testConnection()
  testResult.value = result.message
  testSuccess.value = result.success
  setTimeout(() => {
    testResult.value = null
    testSuccess.value = null
  }, 3000)
}

function showSaved(message: string = '已保存') {
  saveResult.value = message
  saveSuccess.value = true
  if (feedbackTimer) {
    clearTimeout(feedbackTimer)
  }
  feedbackTimer = setTimeout(() => {
    saveResult.value = null
    saveSuccess.value = null
    feedbackTimer = null
  }, 1800)
}

async function openDataDirectory() {
  if (!window.tiex?.shell || !settingsStore.dataDirectory) return
  await window.tiex.shell.openPath(settingsStore.dataDirectory)
}

async function handleProviderChange() {
  await settingsStore.selectProviderById(settingsStore.providerId)
}

async function createProvider(providerType: 'deepseek' | 'siliconflow') {
  const created = await settingsStore.createProvider(
    providerType === 'siliconflow'
      ? {
          name: 'SiliconFlow',
          provider_type: 'siliconflow',
          base_url: 'https://api.siliconflow.cn/v1',
          model_name: 'Qwen/Qwen3-VL-8B-Thinking',
        }
      : {
          name: 'DeepSeek',
          provider_type: 'deepseek',
          base_url: 'https://api.deepseek.com',
          model_name: 'deepseek-v4-flash',
        }
  )
  if (created) {
    showSaved('已新建 Provider，请继续填写配置')
  }
}

async function makeDefaultProvider(id: string) {
  settingsStore.providerId = id
  await settingsStore.selectProviderById(id)
  await settingsStore.saveProviderSettings()
  showSaved('已设为默认 Provider')
}

async function removeProvider(id: string) {
  await settingsStore.deleteProvider(id)
  showSaved('Provider 已删除')
}

async function saveTaskSettings(message?: string) {
  await settingsStore.saveTaskPermissionSettings()
  uiStore.setSidebarCollapsed(settingsStore.defaultSidebar === 'collapsed')
  await settingsStore.loadStatsOverview()
  showSaved(message)
}

async function saveProviderSettings(message?: string) {
  await settingsStore.saveProviderSettings()
  await settingsStore.loadStatsOverview()
  showSaved(message)
}

async function saveAiSettings(message?: string) {
  await aiSettingsStore.saveDefault()
  showSaved(message)
}

function resetAiDefaults() {
  aiSettingsStore.defaultConfig.temperature = null
  aiSettingsStore.defaultConfig.topP = null
  aiSettingsStore.defaultConfig.maxTokens = null
  aiSettingsStore.defaultConfig.contextMessageLimit = 20
  aiSettingsStore.defaultConfig.contextTokenLimit = null
  aiSettingsStore.defaultConfig.streamEnabled = true
  aiSettingsStore.defaultConfig.toolsEnabled = true
  aiSettingsStore.defaultConfig.attachmentsEnabled = null
  showSaved('已恢复默认 AI 参数，请记得保存')
}

async function saveMemorySettings(message?: string) {
  await settingsStore.saveMemorySettings()
  await settingsStore.loadStatsOverview()
  showSaved(message)
}

async function saveAgentSettings(message?: string) {
  await settingsStore.saveAgentSettings()
  showSaved(message)
}

function restoreAgentDefaults() {
  settingsStore.restoreAgentDefaults()
  showSaved('已恢复默认 Agent 配置，请记得保存')
}

async function approveCandidate(candidateId: string) {
  await settingsStore.approveMemoryCandidate(candidateId)
  await settingsStore.loadStatsOverview()
  showSaved('记忆已写入长期偏好')
}

async function rejectCandidate(candidateId: string) {
  await settingsStore.rejectMemoryCandidate(candidateId)
  await settingsStore.loadStatsOverview()
  showSaved('已忽略这条记忆候选')
}

async function refreshSkills() {
  await skillsStore.scanSkills()
  showSaved('Skills 扫描完成')
}

async function importCodexSkills() {
  await skillsStore.importCodexSkills()
  showSaved('已从 Codex 导入 Skills')
}

async function openSkillsFolder() {
  await skillsStore.openFolder()
}

async function toggleSkill(id: string, enabled: boolean) {
  await skillsStore.setEnabled(id, enabled)
}

async function deleteSkill(id: string) {
  const skill = skillsStore.skills.find((item) => item.id === id)
  const confirmed = await uiStore.confirm({
    title: '卸载 Skill',
    message: `确定卸载 ${skill?.displayName || skill?.name || '这个 Skill'}？`,
    detail: 'TieX 只会删除由市场安装到应用 skills 目录内的文件；手动导入的外部目录只会移除记录。',
    confirmText: '卸载',
    cancelText: '取消',
    variant: 'danger',
  })
  if (!confirmed) return
  await skillsStore.deleteSkill(id)
  showSaved('Skill 已卸载')
}

onMounted(() => {
  aiSettingsStore.loadDefault()
  skillsStore.loadSkills()
  if (!route.params.section) {
    router.replace({ name: 'settings', params: { section: activeSection.value } })
  }
})

onBeforeUnmount(() => {
  if (feedbackTimer) {
    clearTimeout(feedbackTimer)
  }
})
</script>

<template>
  <div class="settings-page">
    <div class="settings-container">
      <div class="settings-hero">
        <div class="settings-kicker">TieX</div>
        <h2>{{ activeMeta.title }}</h2>
        <p class="settings-intro">{{ activeMeta.intro }}</p>
      </div>

      <transition name="settings-fade" mode="out-in">
        <section :key="activeSection" class="settings-section">
          <div v-if="activeSection === 'provider'" class="settings-card">
            <div class="card-head">
              <div>
                <h3>模型服务</h3>
                <p class="card-copy">现在这里可以维护多条 Provider 配置。左侧是你的 API 列表，右侧编辑当前选中的那一条；多 Agent 绑定时也会复用这些 Provider。</p>
              </div>
            </div>

            <div class="provider-layout">
              <div class="provider-list-panel">
                <div class="provider-list-head">
                  <div class="provider-list-title">已保存的 Provider</div>
                  <div class="provider-list-actions">
                    <button class="secondary-btn small-btn" @click="createProvider('deepseek')">+ DeepSeek</button>
                    <button class="secondary-btn small-btn" @click="createProvider('siliconflow')">+ SiliconFlow</button>
                  </div>
                </div>

                <div class="provider-list">
                  <button
                    v-for="item in settingsStore.providers"
                    :key="item.id"
                    class="provider-item"
                    :class="{ active: settingsStore.providerId === item.id }"
                    @click="settingsStore.providerId = item.id; handleProviderChange()"
                  >
                    <div class="provider-item-main">
                      <div class="provider-item-title">
                        <span>{{ item.name }}</span>
                        <span v-if="item.is_default === 1" class="default-pill">默认</span>
                      </div>
                      <div class="provider-item-sub">{{ item.provider_type }} · {{ item.model_name }}</div>
                      <div class="capability-strip compact">
                        <span
                          v-for="badge in providerCapabilityBadges(item.provider_type, item.model_name)"
                          :key="badge.key"
                          class="capability-pill"
                          :class="{ off: !badge.enabled }"
                        >
                          {{ badge.label }}
                        </span>
                      </div>
                      <div class="provider-item-sub">{{ item.base_url }}</div>
                    </div>
                  </button>
                </div>
              </div>

              <div class="provider-editor">
                <div class="settings-list">
                  <div class="settings-row row-field">
                    <div class="settings-row-copy">
                      <div class="switch-title">配置名称</div>
                      <div class="switch-desc">给这条 Provider 配置一个便于识别的名字。</div>
                    </div>
                    <div class="settings-row-control">
                      <input v-model="settingsStore.provider" placeholder="例如：DeepSeek 主号 / SiliconFlow 多模态" />
                    </div>
                  </div>
                  <div class="settings-row row-field">
                    <div class="settings-row-copy">
                      <div class="switch-title">服务商类型</div>
                      <div class="switch-desc">决定这条配置走哪个 Provider 协议。</div>
                    </div>
                    <div class="settings-row-control">
                      <select v-model="settingsStore.providerType">
                        <option value="deepseek">deepseek</option>
                        <option value="siliconflow">siliconflow</option>
                      </select>
                    </div>
                  </div>
                  <div class="settings-row row-field">
                    <div class="settings-row-copy">
                      <div class="switch-title">模型名称</div>
                      <div class="switch-desc">选择当前 Provider 默认使用的模型。</div>
                    </div>
                    <div class="settings-row-control">
                      <select v-model="settingsStore.modelName">
                        <option v-for="model in modelOptions" :key="model" :value="model">{{ model }}</option>
                      </select>
                      <div class="model-capability-panel">
                        <div class="capability-panel-head">
                          <span>{{ providerCapabilitySummary(settingsStore.providerType, settingsStore.modelName) }}</span>
                          <b>{{ activeProviderCapabilities.contextLabel }}</b>
                        </div>
                        <div class="capability-strip">
                          <span
                            v-for="badge in activeProviderCapabilityBadges"
                            :key="badge.key"
                            class="capability-pill"
                            :class="{ off: !badge.enabled }"
                          >
                            {{ badge.label }}
                          </span>
                        </div>
                        <div class="capability-note">{{ activeProviderCapabilities.notes[0] }}</div>
                      </div>
                    </div>
                  </div>
                  <div class="settings-row row-field">
                    <div class="settings-row-copy">
                      <div class="switch-title">请求超时</div>
                      <div class="switch-desc">超过这个时间仍未返回时，本次请求会被判定为超时。</div>
                    </div>
                    <div class="settings-row-control short-control">
                      <input v-model.number="settingsStore.providerTimeoutMs" type="number" min="5000" max="300000" step="1000" />
                    </div>
                  </div>
                  <div class="settings-row row-field">
                    <div class="settings-row-copy">
                      <div class="switch-title">Base URL</div>
                      <div class="switch-desc">高级场景下可以改为兼容网关或代理地址。</div>
                    </div>
                    <div class="settings-row-control">
                      <input v-model="settingsStore.baseUrl" />
                    </div>
                  </div>
                  <div class="settings-row row-field">
                    <div class="settings-row-copy">
                      <div class="switch-title">API Key</div>
                      <div class="switch-desc">输入后会覆盖保存当前 Key。</div>
                    </div>
                    <div class="settings-row-control">
                      <input type="password" v-model="settingsStore.apiKey" placeholder="输入或更新 API Key" />
                    </div>
                  </div>
                  <div class="settings-row">
                    <div class="settings-row-copy">
                      <div class="switch-title">启用流式输出</div>
                      <div class="switch-desc">决定当前 Provider 是否以流式方式返回内容。</div>
                    </div>
                    <div class="switch" :class="{ on: settingsStore.streamEnabled }" @click="settingsStore.streamEnabled = !settingsStore.streamEnabled"></div>
                  </div>
                </div>

                <div class="actions">
                  <button class="secondary-btn" @click="testConnection">测试连接</button>
                  <button
                    v-if="settingsStore.providerId"
                    class="secondary-btn"
                    @click="makeDefaultProvider(settingsStore.providerId)"
                  >
                    设为默认
                  </button>
                  <button class="send-btn" @click="saveProviderSettings('模型服务设置已保存')">保存设置</button>
                  <button
                    v-if="settingsStore.providerId && settingsStore.providers.length > 1"
                    class="danger-btn"
                    @click="removeProvider(settingsStore.providerId)"
                  >
                    删除此 Provider
                  </button>
                </div>
              </div>
            </div>
            <div v-if="testResult" class="test-result" :class="{ success: testSuccess, error: testSuccess === false }">{{ testResult }}</div>
          </div>

          <div v-else-if="activeSection === 'ai'" class="settings-card">
            <div class="card-head">
              <div>
                <h3>默认 AI 配置</h3>
                <p class="card-copy">这些参数会作为新会话和未覆盖会话的默认请求策略；Provider 连接信息仍在“模型服务”里维护。</p>
              </div>
            </div>

            <div class="settings-stack">
              <div class="settings-panel">
                <div class="panel-title">默认模型</div>
                <div class="settings-list">
                  <div class="settings-row row-field">
                    <div class="settings-row-copy">
                      <div class="switch-title">默认 Provider</div>
                      <div class="switch-desc">新会话默认继承这条 Provider；会话内仍可单独覆盖。</div>
                    </div>
                    <div class="settings-row-control">
                      <select v-model="aiSettingsStore.defaultConfig.providerId">
                        <option :value="null">跟随模型服务默认 Provider</option>
                        <option v-for="item in settingsStore.providers" :key="item.id" :value="item.id">
                          {{ item.name }} · {{ item.model_name }}
                        </option>
                      </select>
                    </div>
                  </div>
                  <div class="settings-row row-field">
                    <div class="settings-row-copy">
                      <div class="switch-title">默认模型名</div>
                      <div class="switch-desc">留空时使用 Provider 自身配置的模型名。</div>
                    </div>
                    <div class="settings-row-control">
                      <input v-model="aiSettingsStore.defaultConfig.modelName" placeholder="留空则使用 Provider 模型名" />
                      <div class="model-capability-panel">
                        <div class="capability-panel-head">
                          <span>{{ aiDefaultModelLabel }}</span>
                          <b v-if="aiDefaultProvider">{{ providerCapabilitySummary(aiDefaultProvider.provider_type, aiSettingsStore.defaultConfig.modelName || aiDefaultProvider.model_name) }}</b>
                        </div>
                        <div v-if="aiDefaultProvider" class="capability-strip">
                          <span
                            v-for="badge in providerCapabilityBadges(aiDefaultProvider.provider_type, aiSettingsStore.defaultConfig.modelName || aiDefaultProvider.model_name)"
                            :key="badge.key"
                            class="capability-pill"
                            :class="{ off: !badge.enabled }"
                          >
                            {{ badge.label }}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="settings-panel">
                <div class="panel-title">生成参数</div>
                <div class="settings-list">
                  <div class="settings-row row-field">
                    <div class="settings-row-copy">
                      <div class="switch-title">Temperature</div>
                      <div class="switch-desc">留空时不传该参数，由模型服务自行采用默认值。</div>
                    </div>
                    <div class="settings-row-control short-control">
                      <input v-model.number="aiSettingsStore.defaultConfig.temperature" type="number" min="0" max="2" step="0.1" placeholder="默认" />
                    </div>
                  </div>
                  <div class="settings-row row-field">
                    <div class="settings-row-copy">
                      <div class="switch-title">Top P</div>
                      <div class="switch-desc">留空时不传该参数；一般不需要和 temperature 同时大幅调整。</div>
                    </div>
                    <div class="settings-row-control short-control">
                      <input v-model.number="aiSettingsStore.defaultConfig.topP" type="number" min="0" max="1" step="0.05" placeholder="默认" />
                    </div>
                  </div>
                  <div class="settings-row row-field">
                    <div class="settings-row-copy">
                      <div class="switch-title">输出 token 上限</div>
                      <div class="switch-desc">对应 OpenAI 兼容接口的 max_tokens；留空则不主动限制。</div>
                    </div>
                    <div class="settings-row-control short-control">
                      <input v-model.number="aiSettingsStore.defaultConfig.maxTokens" type="number" min="1" step="256" placeholder="默认" />
                    </div>
                  </div>
                </div>
              </div>

              <div class="settings-panel">
                <div class="panel-title">上下文与能力</div>
                <div class="settings-list">
                  <div class="settings-row row-field">
                    <div class="settings-row-copy">
                      <div class="switch-title">上下文消息数量上限</div>
                      <div class="switch-desc">控制每轮模型请求最多带入多少条最近历史消息。</div>
                    </div>
                    <div class="settings-row-control short-control">
                      <input v-model.number="aiSettingsStore.defaultConfig.contextMessageLimit" type="number" min="1" max="200" step="1" />
                    </div>
                  </div>
                  <div class="settings-row row-field">
                    <div class="settings-row-copy">
                      <div class="switch-title">上下文 token 上限</div>
                      <div class="switch-desc">第一版先保存配置并进入快照说明，后续接入真实 token 裁剪。</div>
                    </div>
                    <div class="settings-row-control short-control">
                      <input v-model.number="aiSettingsStore.defaultConfig.contextTokenLimit" type="number" min="1000" step="1000" placeholder="暂不限制" />
                    </div>
                  </div>
                  <div class="settings-row">
                    <div class="settings-row-copy">
                      <div class="switch-title">启用流式输出</div>
                      <div class="switch-desc">关闭后模型会一次性返回结果，工具调用仍可继续解析。</div>
                    </div>
                    <div class="switch" :class="{ on: aiSettingsStore.defaultConfig.streamEnabled !== false }" @click="aiSettingsStore.defaultConfig.streamEnabled = aiSettingsStore.defaultConfig.streamEnabled === false"></div>
                  </div>
                  <div class="settings-row">
                    <div class="settings-row-copy">
                      <div class="switch-title">允许工具调用</div>
                      <div class="switch-desc">关闭后 Agent 本轮不会向模型暴露本地工具定义。</div>
                    </div>
                    <div class="switch" :class="{ on: aiSettingsStore.defaultConfig.toolsEnabled !== false }" @click="aiSettingsStore.defaultConfig.toolsEnabled = aiSettingsStore.defaultConfig.toolsEnabled === false"></div>
                  </div>
                  <div class="settings-row">
                    <div class="settings-row-copy">
                      <div class="switch-title">附件能力提示</div>
                      <div class="switch-desc">默认跟随模型能力判断；后续可扩展为强制禁用附件。</div>
                    </div>
                    <div class="switch" :class="{ on: aiSettingsStore.defaultConfig.attachmentsEnabled === true }" @click="aiSettingsStore.defaultConfig.attachmentsEnabled = aiSettingsStore.defaultConfig.attachmentsEnabled === true ? null : true"></div>
                  </div>
                </div>
              </div>
            </div>

            <div class="actions">
              <button class="secondary-btn" @click="resetAiDefaults">重置参数</button>
              <button class="send-btn" @click="saveAiSettings('默认 AI 配置已保存')">保存设置</button>
            </div>
          </div>

          <div v-else-if="activeSection === 'permissions'" class="settings-card">
            <div class="card-head">
              <div>
                <h3>任务与权限</h3>
                <p class="card-copy">这些设置会直接作用到 Agent 默认权限、任务轮次和命令执行边界。</p>
              </div>
            </div>

            <div class="settings-stack">
              <div class="settings-panel">
                <div class="panel-title">默认行为</div>
                <div class="settings-list">
                  <div class="settings-row row-field">
                    <div class="settings-row-copy">
                      <div class="switch-title">默认权限模式</div>
                      <div class="switch-desc">
                        <template v-if="settingsStore.defaultPermissionMode === 'read'">
                          只能查看工作区内容，不能改文件，也不能执行命令。
                        </template>
                        <template v-else-if="settingsStore.defaultPermissionMode === 'execute'">
                          可以读写文件，但不能执行命令；是否弹确认取决于下面的开关。
                        </template>
                        <template v-else>
                          可以读写文件，也可以执行受限命令；是否弹确认取决于下面的开关。
                        </template>
                      </div>
                    </div>
                    <div class="settings-row-control">
                      <select v-model="settingsStore.defaultPermissionMode">
                        <option value="read">只读模式（read）</option>
                        <option value="execute">可修改文件（execute）</option>
                        <option value="command">可修改文件和执行命令（command）</option>
                      </select>
                    </div>
                  </div>
                  <div class="settings-row row-field">
                    <div class="settings-row-copy">
                      <div class="switch-title">单任务最大轮次</div>
                      <div class="switch-desc">限制单次任务最多推进多少步，避免无限执行。</div>
                    </div>
                    <div class="settings-row-control short-control">
                      <input v-model.number="settingsStore.maxTaskSteps" type="number" min="1" max="100" step="1" />
                    </div>
                  </div>
                  <div class="settings-row row-field">
                    <div class="settings-row-copy">
                      <div class="switch-title">默认命令超时（毫秒）</div>
                      <div class="switch-desc">影响命令执行工具的超时判断。</div>
                    </div>
                    <div class="settings-row-control short-control">
                      <input v-model.number="settingsStore.defaultCommandTimeoutMs" type="number" min="5000" max="300000" step="1000" />
                    </div>
                  </div>
                  <div class="settings-row row-field">
                    <div class="settings-row-copy">
                      <div class="switch-title">侧边栏默认状态</div>
                      <div class="switch-desc">决定新会话或新工作区初始时是展开还是收起。</div>
                    </div>
                    <div class="settings-row-control">
                      <select v-model="settingsStore.defaultSidebar">
                        <option value="expanded">展开</option>
                        <option value="collapsed">收起</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div class="settings-panel">
                <div class="panel-title">确认与保护</div>
                <div class="switch-list light-switch-list">
                  <div class="switch-row">
                    <div>
                      <div class="switch-title">修改文件前请求确认</div>
                      <div class="switch-desc">影响创建文件、编辑文件和文档生成类工具。</div>
                    </div>
                    <div class="switch" :class="{ on: settingsStore.confirmBeforeModify }" @click="settingsStore.confirmBeforeModify = !settingsStore.confirmBeforeModify"></div>
                  </div>
                  <div class="switch-row">
                    <div>
                      <div class="switch-title">执行命令前请求确认</div>
                      <div class="switch-desc">关闭后，中低风险命令会直接执行。</div>
                    </div>
                    <div class="switch" :class="{ on: settingsStore.confirmBeforeCommand }" @click="settingsStore.confirmBeforeCommand = !settingsStore.confirmBeforeCommand"></div>
                  </div>
                  <div class="switch-row">
                    <div>
                      <div class="switch-title">修改文件前自动备份</div>
                      <div class="switch-desc">影响文件恢复与 Diff 回滚能力。</div>
                    </div>
                    <div class="switch" :class="{ on: settingsStore.autoBackup }" @click="settingsStore.autoBackup = !settingsStore.autoBackup"></div>
                  </div>
                </div>
              </div>
            </div>

            <div class="actions">
              <button class="send-btn" @click="saveTaskSettings('任务与权限设置已保存')">保存设置</button>
            </div>
          </div>

          <div v-else-if="activeSection === 'agents'" class="settings-card">
            <div class="card-head">
              <div>
                <h3>多 Agent 协作</h3>
                <p class="card-copy">把 TieX 拆成三个固定分工：资料整理、规则记忆、代码实现。你可以分别指定它们用哪个 Provider，以及直接改运行时提示词。</p>
              </div>
            </div>

            <div class="settings-stack agent-section-stack">
              <div class="settings-panel compact-panel standalone-switch-panel">
                <div class="settings-list">
                  <div class="switch-row">
                    <div class="settings-row-copy">
                      <div class="switch-title">启用多 Agent 顺序协作</div>
                      <div class="switch-desc">开启后，会先生成“资料整理简报”和“规则记忆简报”，再交给代码实现 Agent 真正执行。</div>
                    </div>
                    <div class="switch" :class="{ on: settingsStore.multiAgentEnabled }" @click="settingsStore.multiAgentEnabled = !settingsStore.multiAgentEnabled"></div>
                  </div>
                </div>
              </div>

              <div class="agent-profile-list">
                <div class="agent-card" v-for="profile in [
                  { role: 'responder', label: '主对话 Agent', desc: '最后负责面向用户组织自然回复。' },
                  { role: 'implementation', label: '代码实现 Agent', desc: '真正读写文件、执行命令、完成任务。' },
                  { role: 'research', label: '资料整理 Agent', desc: '整理目标、上下文、风险和推进顺序。' },
                  { role: 'memory', label: '规则记忆 Agent', desc: '提炼偏好、项目规则和注意事项。' },
                ]" :key="profile.role">
                  <div class="agent-card-head">
                    <div class="settings-row-copy">
                      <div class="agent-title">{{ profile.label }}</div>
                      <div class="agent-desc">{{ profile.desc }}</div>
                    </div>
                  </div>
                  <div class="settings-list agent-settings-list">
                    <div class="settings-row row-field">
                      <div class="settings-row-copy">
                        <div class="switch-title">API / Provider 绑定</div>
                        <div class="switch-desc">可以单独指定这个 Agent 使用哪条 Provider；不选则跟随当前会话。</div>
                      </div>
                      <div class="settings-row-control">
                        <select v-model="settingsStore.agentProviderBindings[profile.role as 'responder' | 'implementation' | 'research' | 'memory']">
                          <option :value="null">跟随当前会话 Provider</option>
                          <option v-for="item in settingsStore.providers" :key="item.id" :value="item.id">
                            {{ item.name }} · {{ item.model_name }} · {{ providerCapabilitySummary(item.provider_type, item.model_name) }}
                          </option>
                        </select>
                      </div>
                    </div>
                    <div class="settings-form-block prompt-field">
                      <div class="settings-form-head">
                        <div class="switch-title">运行时 Prompt</div>
                        <div class="switch-desc">这类内容较长，保留表单区编辑，避免挤成一行。</div>
                      </div>
                      <textarea
                        v-model="settingsStore.agentPrompts[profile.role as 'responder' | 'implementation' | 'research' | 'memory']"
                        rows="4"
                        :placeholder="`${profile.label} 的运行时提示词`"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="actions">
              <button class="secondary-btn" @click="restoreAgentDefaults">恢复默认</button>
              <button class="send-btn" @click="saveAgentSettings('多 Agent 配置已保存')">保存设置</button>
            </div>
          </div>

          <div v-else-if="activeSection === 'memory'" class="settings-card">
            <div class="card-head">
              <div>
                <h3>用户偏好与记忆</h3>
                <p class="card-copy">这里定义 AI 对你的称呼、长期偏好，以及自动提取出来等待确认的记忆候选。</p>
              </div>
            </div>

            <div class="settings-stack">
              <div class="settings-panel">
                <div class="settings-list">
                  <div class="settings-row row-field">
                    <div class="settings-row-copy">
                      <div class="switch-title">AI 如何称呼你</div>
                      <div class="switch-desc">会影响首页问候、对话语气和偏好记忆中的称呼展示。</div>
                    </div>
                    <div class="settings-row-control">
                      <input v-model="settingsStore.userDisplayName" placeholder="例如：橙子、小橙、ORANGE" />
                    </div>
                  </div>
                  <div class="settings-form-block">
                    <div class="settings-form-head">
                      <div class="switch-title">用户偏好</div>
                      <div class="switch-desc">记录长期表达偏好，例如回答语言、风格和推进方式。</div>
                    </div>
                    <textarea v-model="settingsStore.userPreferences" rows="4" placeholder="例如：默认中文、先给结论、少说套话、尽量直接推进。" />
                  </div>
                </div>
              </div>

              <div class="settings-panel">
                <div class="panel-title">自动提取的记忆候选</div>
                <div v-if="settingsStore.memoryCandidates.length === 0" class="memory-empty">
                  暂时没有新的候选。之后你在对话里表达偏好、称呼或项目规则时，TieX 会自动提取并放到这里等你确认。
                </div>
                <div v-else class="memory-candidate-list">
                  <div v-for="candidate in settingsStore.memoryCandidates" :key="candidate.id" class="memory-candidate-card">
                    <div class="memory-candidate-meta">
                      <span class="memory-tag">{{ candidate.scope === 'workspace' ? '工作区' : '长期偏好' }}</span>
                      <span class="memory-tag subtle">{{ candidate.category }}</span>
                    </div>
                    <div class="memory-candidate-text">{{ candidate.candidate_text }}</div>
                    <div class="memory-candidate-actions">
                      <button class="secondary-btn" @click="rejectCandidate(candidate.id)">忽略</button>
                      <button class="send-btn" @click="approveCandidate(candidate.id)">写入记忆</button>
                    </div>
                  </div>
                </div>
              </div>

              <div class="settings-panel">
                <div class="settings-form-block">
                  <div class="settings-form-head">
                    <div class="switch-title">全局记忆</div>
                    <div class="switch-desc">记录你的长期偏好，例如回答语言、输出风格、常用 Provider。</div>
                  </div>
                  <textarea v-model="settingsStore.globalMemory" rows="4" placeholder="记录你的长期偏好，例如回答语言、输出风格、常用 Provider。" />
                </div>
                <div class="settings-form-block">
                  <div class="settings-form-head">
                    <div class="switch-title">自定义系统提示词</div>
                    <div class="switch-desc">追加到实际运行时 prompt 末尾，适合放长期规则或统一风格要求。</div>
                  </div>
                  <textarea v-model="settingsStore.customSystemPrompt" rows="5" placeholder="追加到实际运行时 prompt 末尾。适合写你希望 Agent 始终遵守的风格或偏好。" />
                </div>
                </div>
            </div>

            <div class="actions">
              <button class="send-btn" @click="saveMemorySettings('用户偏好与记忆已保存')">保存设置</button>
            </div>
          </div>

          <div v-else-if="activeSection === 'skills'" class="settings-card">
            <div class="card-head">
              <div>
                <h3>Skills 管理</h3>
                <p class="card-copy">TieX 会扫描本地 skills 目录中每个包含 SKILL.md 的文件夹；启用后可在输入框用 $skillName 引用。</p>
              </div>
            </div>

            <div class="settings-panel compact-panel">
              <div class="settings-list">
                <div class="settings-row">
                  <div class="settings-row-copy">
                    <div class="switch-title">本地 Skills 文件夹</div>
                    <div class="switch-desc">手动放入 skill 文件夹后，点击刷新扫描即可导入。</div>
                  </div>
                  <div class="inline-actions">
                    <button class="secondary-btn" @click="openSkillsFolder">打开文件夹</button>
                    <button class="secondary-btn" @click="importCodexSkills">从 Codex 导入</button>
                    <button class="send-btn" @click="refreshSkills">刷新扫描</button>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="skillsStore.skills.length === 0" class="memory-empty">
              还没有安装任何 Skill。可以从侧边栏的 Skills 市场安装，也可以手动把包含 SKILL.md 的文件夹放进本地 skills 目录。
            </div>
            <div v-else class="skill-list">
              <div v-for="skill in skillsStore.skills" :key="skill.id" class="skill-card">
                <div class="skill-card-main">
                  <div class="skill-title-row">
                    <span class="skill-title">{{ skill.displayName }}</span>
                    <span class="memory-tag">{{ skill.name }}</span>
                    <span v-if="skill.version" class="memory-tag subtle">{{ skill.version }}</span>
                  </div>
                  <div class="skill-desc">{{ skill.description || skill.summary || '这个 Skill 暂无描述。' }}</div>
                  <div class="skill-path">{{ skill.path }}</div>
                </div>
                <div class="skill-actions">
                  <div class="switch" :class="{ on: skill.enabled }" @click="toggleSkill(skill.id, !skill.enabled)"></div>
                  <button class="danger-btn small-btn" @click="deleteSkill(skill.id)">卸载</button>
                </div>
              </div>
            </div>
          </div>

          <div v-else-if="activeSection === 'data'" class="settings-card">
            <div class="card-head">
              <div>
                <h3>本地数据</h3>
                <p class="card-copy">TieX 的数据库、缓存和日志都保存在这个目录下。</p>
              </div>
            </div>

            <div class="settings-panel compact-panel">
              <div class="settings-list">
                <div class="settings-row">
                  <div class="settings-row-copy">
                    <div class="switch-title">数据目录</div>
                    <div class="switch-desc data-path">{{ settingsStore.dataDirectory }}</div>
                  </div>
                  <button class="secondary-btn" @click="openDataDirectory">打开数据目录</button>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="settings-card">
            <div class="card-head">
              <div>
                <h3>数据统计</h3>
                <p class="card-copy">这里展示 TieX 当前本地数据规模、模型使用分布和 token 消耗趋势。</p>
              </div>
            </div>

            <template v-if="settingsStore.statsOverview">
              <div class="stats-grid">
                <div class="stat-box">
                  <div class="stat-label">工作区</div>
                  <div class="stat-value">{{ settingsStore.statsOverview.workspace_count }}</div>
                </div>
                <div class="stat-box">
                  <div class="stat-label">会话</div>
                  <div class="stat-value">{{ settingsStore.statsOverview.conversation_count }}</div>
                </div>
                <div class="stat-box">
                  <div class="stat-label">Assistant 消息</div>
                  <div class="stat-value">{{ settingsStore.statsOverview.assistant_message_count }}</div>
                </div>
                <div class="stat-box">
                  <div class="stat-label">累计 Token</div>
                  <div class="stat-value">{{ settingsStore.statsOverview.total_tokens }}</div>
                </div>
              </div>

              <div class="settings-panel compact-panel stats-section-panel">
                <UsageDonutChart :items="settingsStore.statsOverview.model_usage" />
              </div>

              <div class="stats-range">
                <button v-for="item in ['hour', 'day', 'week', 'month']" :key="item" class="range-btn" :class="{ active: statsRange === item }" @click="statsRange = item as any">
                  {{ item }}
                </button>
              </div>
              <TokenSeriesChart :points="activeStatsSeries" :label="`全局 token 趋势 · ${statsRange}`" />
            </template>
            <div v-else class="memory-empty">
              还没有可展示的统计数据。等你开始使用工作区和会话后，这里会逐步出现使用分布和 token 趋势。
            </div>
          </div>
        </section>
      </transition>
    </div>

    <transition name="toast-fade">
      <div v-if="saveResult" class="save-toast" :class="{ success: saveSuccess, error: saveSuccess === false }">
        {{ saveResult }}
      </div>
    </transition>
  </div>
</template>

<style scoped>
.settings-page {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 34px 26px 34px;
  --settings-surface-1: var(--panel);
  --settings-surface-2: var(--panel-2);
  --settings-surface-3: var(--panel-3);
  --settings-stroke-1: color-mix(in srgb, var(--line) 72%, rgba(0, 0, 0, 0.08));
  --settings-stroke-2: color-mix(in srgb, var(--line) 92%, rgba(0, 0, 0, 0.16));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--topbar-bg) 36%, transparent), transparent 132px),
    var(--bg);
}

:global(html[data-theme='dark']) .settings-page {
  --settings-surface-1: color-mix(in srgb, var(--panel-2) 88%, var(--bg));
  --settings-surface-2: color-mix(in srgb, var(--panel-3) 76%, var(--bg));
  --settings-surface-3: color-mix(in srgb, var(--sidebar-surface) 92%, var(--panel-3));
  --settings-stroke-1: color-mix(in srgb, rgba(255, 255, 255, 0.18) 82%, var(--sidebar-border));
  --settings-stroke-2: color-mix(in srgb, rgba(255, 255, 255, 0.28) 92%, var(--sidebar-border));
}

:global(html[data-theme='light']) .settings-page {
  --settings-surface-1: color-mix(in srgb, var(--panel-2) 58%, white);
  --settings-surface-2: color-mix(in srgb, var(--panel-3) 46%, white);
  --settings-surface-3: color-mix(in srgb, var(--panel-3) 74%, white);
  --settings-stroke-1: color-mix(in srgb, rgba(30, 29, 26, 0.16) 78%, var(--line));
  --settings-stroke-2: color-mix(in srgb, rgba(30, 29, 26, 0.24) 92%, var(--line));
}

.settings-container {
  width: min(980px, 100%);
  margin: 0 auto;
}

.settings-hero {
  margin-bottom: 22px;
  padding-left: 2px;
}

.settings-kicker {
  font-size: 9px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--topbar-text-soft);
  margin-bottom: 4px;
  font-weight: 700;
}

.settings-container h2 {
  margin: 0;
  font-size: clamp(18px, 2.3vw, 28px);
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--text-strong);
}

.settings-intro {
  margin: 10px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
  max-width: 720px;
}

.settings-section {
  min-height: calc(100% - 72px);
}

.settings-card {
  background: transparent;
  border: 0;
  border-radius: 0;
  padding: 0;
  box-shadow: none;
  backdrop-filter: none;
}

.card-head {
  margin-bottom: 18px;
}

.settings-card h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--text-strong);
}

.card-copy {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.65;
}

.provider-layout {
  display: grid;
  grid-template-columns: 248px 1fr;
  gap: 18px;
  align-items: start;
}

.provider-list-panel,
.provider-editor {
  border: 1px solid var(--settings-stroke-1, color-mix(in srgb, var(--sidebar-border) 42%, transparent));
  border-radius: 18px;
  padding: 16px;
  background: var(--settings-surface-1, color-mix(in srgb, var(--sidebar-surface) 6%, transparent));
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--sidebar-surface) 10%, transparent),
    0 1px 0 color-mix(in srgb, white 5%, transparent);
}

.provider-editor {
  padding-left: 16px;
}

.provider-list-head {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}

.provider-list-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-strong);
  letter-spacing: -0.01em;
  text-transform: none;
}

.provider-list-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.provider-list {
  display: grid;
  gap: 8px;
}

.provider-item {
  width: 100%;
  text-align: left;
  border: 1px solid var(--settings-stroke-1, color-mix(in srgb, var(--sidebar-border) 44%, transparent));
  border-radius: 15px;
  padding: 11px 12px;
  background: var(--settings-surface-2, color-mix(in srgb, var(--sidebar-surface) 12%, transparent));
  color: var(--sidebar-text);
  box-shadow: inset 0 1px 0 color-mix(in srgb, white 4%, transparent);
  transition: background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
}

.provider-item.active {
  border-color: color-mix(in srgb, var(--accent) 26%, var(--sidebar-border));
  background: color-mix(in srgb, var(--accent) 8%, var(--sidebar-surface));
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 5%, transparent),
    0 0 0 1px color-mix(in srgb, var(--accent) 10%, transparent);
}

.provider-item:hover {
  background: var(--sidebar-item-hover);
}

.provider-item-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
}

.provider-item-sub {
  margin-top: 5px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.45;
  word-break: break-all;
}

.capability-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 9px;
}

.capability-strip.compact {
  margin-top: 8px;
}

.capability-pill {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--success) 22%, var(--sidebar-border));
  background: color-mix(in srgb, var(--success) 8%, transparent);
  color: var(--success-strong);
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}

.capability-pill.off {
  border-color: color-mix(in srgb, var(--sidebar-border) 78%, transparent);
  background: color-mix(in srgb, var(--sidebar-bg) 38%, transparent);
  color: var(--muted);
}

.model-capability-panel {
  margin-top: 10px;
  padding: 11px 12px;
  border: 1px solid color-mix(in srgb, var(--settings-stroke-1) 80%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--settings-surface-2) 76%, transparent);
}

.capability-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.capability-panel-head span {
  min-width: 0;
  color: var(--text-strong);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.35;
}

.capability-panel-head b {
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
}

.capability-note {
  margin-top: 8px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.default-pill {
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  color: color-mix(in srgb, var(--accent) 80%, var(--text-strong));
  font-size: 10px;
  font-weight: 600;
}

.small-btn {
  padding: 7px 10px;
  min-height: auto;
  font-size: 12px;
}

.settings-row-control input,
.settings-row-control select,
.settings-form-block textarea {
  border: 1px solid var(--settings-stroke-2, color-mix(in srgb, var(--sidebar-border) 70%, transparent));
  background: var(--settings-surface-3, color-mix(in srgb, var(--sidebar-bg) 34%, var(--sidebar-surface)));
  color: var(--text-strong);
  border-radius: 16px;
  padding: 12px 14px;
  outline: none;
  resize: vertical;
  font-size: 14px;
  line-height: 1.5;
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 6%, transparent),
    inset 0 -1px 0 color-mix(in srgb, black 8%, transparent);
  transition:
    border-color 120ms ease,
    background-color 120ms ease,
    box-shadow 120ms ease,
    transform 120ms ease;
}

.settings-row-control input:focus,
.settings-row-control select:focus,
.settings-form-block textarea:focus {
  border-color: color-mix(in srgb, var(--accent) 48%, var(--sidebar-border));
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 6%, transparent),
    inset 0 -1px 0 color-mix(in srgb, black 8%, transparent),
    0 0 0 2px color-mix(in srgb, var(--accent) 12%, transparent);
}

.settings-stack {
  display: grid;
  gap: 24px;
}

.agent-section-stack {
  gap: 30px;
}

.standalone-switch-panel {
  position: relative;
}

.settings-panel {
  border: 1px solid var(--settings-stroke-1, color-mix(in srgb, var(--sidebar-border) 46%, transparent));
  border-radius: 18px;
  padding: 0;
  background: var(--settings-surface-1, color-mix(in srgb, var(--sidebar-surface) 5%, transparent));
  overflow: hidden;
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, white 4%, transparent),
    0 0 0 1px color-mix(in srgb, var(--settings-stroke-1) 24%, transparent);
}

.settings-panel.compact-panel {
  padding: 0;
}

.settings-list {
  display: grid;
  margin: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  overflow: visible;
  box-shadow: none;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 18px 20px;
  border-bottom: 1px solid color-mix(in srgb, var(--settings-stroke-1) 76%, transparent);
}

.settings-row:last-child {
  border-bottom: 0;
}

.settings-row-copy {
  min-width: 0;
  flex: 1 1 auto;
}

.settings-row-control {
  width: min(420px, 46%);
  flex: 0 0 auto;
}

.settings-row-control.short-control {
  width: 180px;
}

.settings-row-control input,
.settings-row-control select {
  width: 100%;
}

.settings-row-control input,
.settings-row-control select,
.settings-form-block textarea {
  min-height: 46px;
}

.settings-row-control select {
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  border-color: color-mix(in srgb, var(--sidebar-border) 80%, transparent);
  background-color: color-mix(in srgb, var(--sidebar-bg) 42%, var(--sidebar-surface));
  border-radius: 17px;
  padding-right: 52px;
  background-image:
    linear-gradient(45deg, transparent 50%, color-mix(in srgb, var(--text-strong) 84%, transparent) 50%),
    linear-gradient(135deg, color-mix(in srgb, var(--text-strong) 84%, transparent) 50%, transparent 50%),
    linear-gradient(180deg, color-mix(in srgb, var(--sidebar-border) 46%, transparent), color-mix(in srgb, var(--sidebar-border) 46%, transparent));
  background-position:
    calc(100% - 22px) calc(50% - 2px),
    calc(100% - 16px) calc(50% - 2px),
    calc(100% - 38px) 50%;
  background-size: 7px 7px, 7px 7px, 1px 58%;
  background-repeat: no-repeat;
}

.settings-row-control select:hover,
.settings-row-control input:hover,
.settings-form-block textarea:hover {
  border-color: color-mix(in srgb, var(--sidebar-border) 92%, transparent);
  background: color-mix(in srgb, var(--sidebar-bg) 50%, var(--sidebar-surface));
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 7%, transparent),
    inset 0 -1px 0 color-mix(in srgb, black 8%, transparent);
}

.settings-row-control select:focus {
  background-color: color-mix(in srgb, var(--sidebar-bg) 46%, var(--sidebar-surface));
}

.row-field {
  align-items: flex-start;
}

.settings-form-block {
  padding: 18px 20px 20px;
  border-top: 1px solid color-mix(in srgb, var(--settings-stroke-1) 76%, transparent);
}

.settings-form-block:first-child {
  border-top: 0;
}

.settings-form-head {
  margin-bottom: 10px;
}

.settings-form-block textarea {
  width: 100%;
}

.panel-title {
  margin: 0;
  padding: 18px 20px 10px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
  text-transform: none;
  color: var(--text-strong);
}

.switch-list {
  margin: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  overflow: visible;
  box-shadow: none;
}

.switch-list.slim {
  margin-top: 0;
}

.light-switch-list {
  border-top: 0;
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 18px 20px;
  border-bottom: 1px solid color-mix(in srgb, var(--settings-stroke-1) 76%, transparent);
}

.switch-row:last-child {
  border-bottom: 0;
}

.switch-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-strong);
}

.switch-desc {
  margin-top: 5px;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.6;
}

.switch {
  width: 40px;
  height: 22px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--sidebar-text-muted) 18%, transparent);
  padding: 3px;
  cursor: pointer;
  transition: background 0.2s;
  flex: 0 0 auto;
}

.switch::after {
  content: '';
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--sidebar-surface);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
  transition: transform 0.2s;
}

.switch.on {
  background: var(--accent);
}

.switch.on::after {
  transform: translateX(18px);
}

.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 20px;
  flex-wrap: wrap;
}

.test-result {
  margin-top: 16px;
  padding: 11px 13px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
  font-size: 12px;
}

.test-result.success {
  background: var(--success-soft);
  color: var(--success-strong);
}

.test-result.error {
  background: var(--danger-soft);
  color: var(--danger-strong);
}

.save-toast {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 40;
  min-width: 180px;
  max-width: min(360px, calc(100vw - 32px));
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--sidebar-border));
  background: color-mix(in srgb, var(--sidebar-surface) 98%, transparent);
  color: var(--text-strong);
  box-shadow: var(--shadow-pop);
}

.save-toast.success {
  border-color: color-mix(in srgb, var(--success-strong) 28%, var(--line));
}

.save-toast.error {
  border-color: color-mix(in srgb, var(--danger-strong) 28%, var(--line));
  color: var(--danger-strong);
}

.memory-empty {
  border: 1px dashed color-mix(in srgb, var(--sidebar-border) 62%, transparent);
  border-radius: 16px;
  padding: 14px;
  margin: 0 20px 20px;
  color: var(--muted);
  line-height: 1.6;
  background: var(--settings-surface-2, color-mix(in srgb, var(--sidebar-surface) 8%, transparent));
  font-size: 13px;
}

.memory-candidate-list {
  display: grid;
  gap: 0;
  margin: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  overflow: visible;
  box-shadow: none;
}

.memory-candidate-card {
  border-top: 1px solid color-mix(in srgb, var(--settings-stroke-1) 76%, transparent);
  padding: 18px 20px;
  background: transparent;
}

.memory-candidate-card:first-child {
  border-top: 0;
}

.memory-candidate-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.memory-tag {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
  font-size: 11px;
}

.memory-tag.subtle {
  background: color-mix(in srgb, var(--sidebar-bg) 44%, transparent);
  color: var(--muted);
  border: 1px solid var(--sidebar-border);
}

.memory-candidate-text {
  color: var(--text-strong);
  line-height: 1.6;
  font-size: 14px;
}

.memory-candidate-actions {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.inline-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.skill-list {
  display: grid;
  gap: 10px;
  margin-top: 16px;
}

.skill-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 16px 18px;
  border: 1px solid var(--settings-stroke-1);
  border-radius: 18px;
  background: var(--settings-surface-1);
}

.skill-card-main {
  min-width: 0;
}

.skill-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.skill-title {
  color: var(--text-strong);
  font-size: 14px;
  font-weight: 700;
}

.skill-desc {
  margin-top: 8px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.55;
}

.skill-path {
  margin-top: 8px;
  color: var(--sidebar-text-muted);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 11px;
  line-height: 1.45;
  word-break: break-all;
}

.skill-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}

.agent-profile-list {
  display: grid;
  gap: 20px;
  margin-top: 2px;
}

.agent-card {
  border: 1px solid var(--settings-stroke-1, color-mix(in srgb, var(--sidebar-border) 18%, transparent));
  border-radius: 18px;
  padding: 0;
  background: var(--settings-surface-1, color-mix(in srgb, var(--sidebar-surface) 3%, transparent));
  overflow: hidden;
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, white 4%, transparent),
    0 0 0 1px color-mix(in srgb, var(--settings-stroke-1) 24%, transparent);
}

.agent-card-head {
  margin-bottom: 0;
  padding: 18px 20px 12px;
}

.agent-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-strong);
}

.agent-desc {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--muted);
}

.prompt-field textarea {
  min-height: 120px;
}

.agent-settings-list {
  border-top: 1px solid color-mix(in srgb, var(--settings-stroke-1) 76%, transparent);
  margin: 0;
  border-left: 0;
  border-right: 0;
  border-bottom: 0;
  border-radius: 0;
}

.toast-fade-enter-active,
.toast-fade-leave-active,
.settings-fade-enter-active,
.settings-fade-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to,
.settings-fade-enter-from,
.settings-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 18px;
}

.stat-box {
  border: 1px solid color-mix(in srgb, var(--sidebar-border) 18%, transparent);
  border-radius: 16px;
  padding: 14px 16px;
  background: color-mix(in srgb, var(--sidebar-surface) 3%, transparent);
}

.stat-label {
  color: var(--muted-soft);
  font-size: 12px;
  text-transform: none;
  letter-spacing: 0;
}

.stat-value {
  margin-top: 8px;
  font-size: 22px;
  font-weight: 600;
  color: var(--text-strong);
}

.stats-section-panel {
  margin-bottom: 16px;
}

.stats-range {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.range-btn {
  border: 1px solid var(--sidebar-border);
  border-radius: 999px;
  padding: 7px 10px;
  background: transparent;
  color: var(--sidebar-text-muted);
  text-transform: none;
  font-size: 12px;
}

.range-btn.active {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 18%, var(--sidebar-border));
}

.data-path {
  color: var(--muted);
  font-size: 14px;
  line-height: 1.55;
  word-break: break-all;
}

@media (max-width: 900px) {
  .settings-page {
    padding: 28px 18px 32px;
  }

  .provider-layout {
    grid-template-columns: 1fr;
  }

  .provider-editor {
    padding-left: 16px;
    border-left: 0;
    border-top: 1px solid color-mix(in srgb, var(--sidebar-border) 18%, transparent);
    padding-top: 14px;
  }

  .settings-row,
  .switch-row {
    flex-direction: column;
    align-items: stretch;
  }

  .settings-row-control,
  .settings-row-control.short-control {
    width: 100%;
  }

  .settings-list,
  .switch-list,
  .memory-empty,
  .memory-candidate-list {
    margin-left: 0;
    margin-right: 0;
    margin-bottom: 0;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>

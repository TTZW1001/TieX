<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSettingsStore } from '@/stores/settings.store'
import UsageDonutChart from '@/components/UsageDonutChart.vue'
import TokenSeriesChart from '@/components/TokenSeriesChart.vue'

const settingsStore = useSettingsStore()
const testResult = ref<string | null>(null)
const saveResult = ref<string | null>(null)
const testSuccess = ref<boolean | null>(null)
const saveSuccess = ref<boolean | null>(null)
const statsRange = ref<'hour' | 'day' | 'week' | 'month'>('day')
let feedbackTimer: ReturnType<typeof setTimeout> | null = null

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
  await settingsStore.loadStatsOverview()
  showSaved(message)
}

async function saveProviderSettings(message?: string) {
  await settingsStore.saveProviderSettings()
  await settingsStore.loadStatsOverview()
  showSaved(message)
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

const activeStatsSeries = computed(() => {
  return settingsStore.statsOverview?.token_series?.[statsRange.value] ?? []
})
</script>

<template>
  <div class="settings-page">
    <div class="settings-container">
      <div class="settings-hero">
        <div class="settings-kicker">Settings</div>
        <h2 class="display-serif">运行方式、权限边界与本地数据</h2>
        <p class="settings-intro">这里保留的都是当前版本真正会影响 TieX 行为的设置。</p>
      </div>

      <div class="settings-card">
        <div class="card-head">
          <div>
            <h3 class="display-serif">模型服务</h3>
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
                  <div class="provider-item-sub">{{ item.base_url }}</div>
                </div>
              </button>
            </div>
          </div>

          <div class="provider-editor">
            <div class="form-grid">
              <div class="form-field">
                <label>配置名称</label>
                <input v-model="settingsStore.provider" placeholder="例如：DeepSeek 主号 / SiliconFlow 多模态" />
              </div>
              <div class="form-field">
                <label>服务商类型</label>
                <select v-model="settingsStore.providerType">
                  <option value="deepseek">deepseek</option>
                  <option value="siliconflow">siliconflow</option>
                </select>
              </div>
              <div class="form-field">
                <label>模型名称</label>
                <select v-model="settingsStore.modelName">
                  <option v-for="model in modelOptions" :key="model" :value="model">{{ model }}</option>
                </select>
              </div>
              <div class="form-field">
                <label>请求超时（毫秒）</label>
                <input v-model.number="settingsStore.providerTimeoutMs" type="number" min="5000" max="300000" step="1000" />
              </div>
              <div class="form-field full">
                <label>Base URL</label>
                <input v-model="settingsStore.baseUrl" />
              </div>
              <div class="form-field full">
                <label>API Key</label>
                <input type="password" v-model="settingsStore.apiKey" placeholder="输入或更新 API Key" />
              </div>
              <div class="switch-field full">
                <div>
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

      <div class="settings-card">
        <div class="card-head">
          <div>
            <h3 class="display-serif">任务与权限</h3>
            <p class="card-copy">这些设置会直接作用到 Agent 默认权限、任务轮次和命令执行边界。</p>
          </div>
        </div>

        <div class="form-grid">
          <div class="form-field">
            <label>默认权限模式</label>
            <select v-model="settingsStore.defaultPermissionMode">
              <option value="read">只读模式（read）</option>
              <option value="execute">可修改文件（execute）</option>
              <option value="command">可修改文件和执行命令（command）</option>
            </select>
            <div class="field-hint">
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
          <div class="form-field">
            <label>单任务最大轮次</label>
            <input v-model.number="settingsStore.maxTaskSteps" type="number" min="1" max="100" step="1" />
          </div>
          <div class="form-field">
            <label>默认命令超时（毫秒）</label>
            <input v-model.number="settingsStore.defaultCommandTimeoutMs" type="number" min="5000" max="300000" step="1000" />
          </div>
          <div class="form-field">
            <label>侧边栏默认状态</label>
            <select v-model="settingsStore.defaultSidebar">
              <option value="expanded">展开</option>
              <option value="collapsed">收起</option>
            </select>
          </div>
        </div>

        <div class="switch-list">
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

        <div class="actions">
          <button class="send-btn" @click="saveTaskSettings('任务与权限设置已保存')">保存设置</button>
        </div>
      </div>

      <div class="settings-card">
        <div class="card-head">
          <div>
            <h3 class="display-serif">多 Agent 协作</h3>
            <p class="card-copy">把 TieX 拆成三个固定分工：资料整理、规则记忆、代码实现。你可以分别指定它们用哪个 Provider，以及直接改运行时提示词。</p>
          </div>
        </div>

        <div class="switch-list slim">
          <div class="switch-row">
            <div>
              <div class="switch-title">启用多 Agent 顺序协作</div>
              <div class="switch-desc">开启后，会先生成“资料整理简报”和“规则记忆简报”，再交给代码实现 Agent 真正执行。</div>
            </div>
            <div class="switch" :class="{ on: settingsStore.multiAgentEnabled }" @click="settingsStore.multiAgentEnabled = !settingsStore.multiAgentEnabled"></div>
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
              <div>
                <div class="agent-title">{{ profile.label }}</div>
                <div class="agent-desc">{{ profile.desc }}</div>
              </div>
            </div>
            <div class="form-grid">
              <div class="form-field">
                <label>API / Provider 绑定</label>
                <select v-model="settingsStore.agentProviderBindings[profile.role as 'responder' | 'implementation' | 'research' | 'memory']">
                  <option :value="null">跟随当前会话 Provider</option>
                  <option v-for="item in settingsStore.providers" :key="item.id" :value="item.id">
                    {{ item.name }} · {{ item.model_name }}
                  </option>
                </select>
              </div>
              <div class="form-field full">
                <label>运行时 Prompt</label>
                <textarea
                  v-model="settingsStore.agentPrompts[profile.role as 'responder' | 'implementation' | 'research' | 'memory']"
                  rows="6"
                  :placeholder="`${profile.label} 的运行时提示词`"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="actions">
          <button class="secondary-btn" @click="restoreAgentDefaults">恢复默认</button>
          <button class="send-btn" @click="saveAgentSettings('多 Agent 配置已保存')">保存设置</button>
        </div>
      </div>

      <div class="settings-card">
        <div class="card-head">
          <div>
            <h3 class="display-serif">用户偏好与记忆</h3>
            <p class="card-copy">这里定义 AI 对你的称呼、长期偏好，以及自动提取出来等待确认的记忆候选。</p>
          </div>
        </div>

        <div class="form-grid">
          <div class="form-field">
            <label>AI 如何称呼你</label>
            <input v-model="settingsStore.userDisplayName" placeholder="例如：橙子、小橙、ORANGE" />
          </div>
          <div class="form-field">
            <label>用户偏好</label>
            <textarea v-model="settingsStore.userPreferences" rows="5" placeholder="例如：默认中文、先给结论、少说套话、尽量直接推进。" />
          </div>
          <div class="form-field full">
            <label>自动提取的记忆候选</label>
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
          <div class="form-field full">
            <label>全局记忆</label>
            <textarea v-model="settingsStore.globalMemory" rows="5" placeholder="记录你的长期偏好，例如回答语言、输出风格、常用 Provider。" />
          </div>
          <div class="form-field full">
            <label>自定义系统提示词</label>
            <textarea v-model="settingsStore.customSystemPrompt" rows="8" placeholder="追加到实际运行时 prompt 末尾。适合写你希望 Agent 始终遵守的风格或偏好。" />
          </div>
        </div>

        <div class="actions">
          <button class="send-btn" @click="saveMemorySettings('用户偏好与记忆已保存')">保存设置</button>
        </div>
      </div>

      <div class="settings-card">
        <div class="card-head">
          <div>
            <h3 class="display-serif">本地数据</h3>
            <p class="card-copy">TieX 的数据库、缓存和日志都保存在这个目录下。</p>
          </div>
        </div>

        <div class="data-panel">
          <div class="data-path">{{ settingsStore.dataDirectory }}</div>
          <button class="secondary-btn" @click="openDataDirectory">打开数据目录</button>
        </div>
      </div>

      <div class="settings-card" v-if="settingsStore.statsOverview">
        <div class="card-head">
          <div>
            <h3 class="display-serif">数据统计</h3>
            <p class="card-copy">这里展示 TieX 当前本地数据规模、模型使用分布和 token 消耗趋势。</p>
          </div>
        </div>

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

        <div class="stats-panel">
          <UsageDonutChart :items="settingsStore.statsOverview.model_usage" />
        </div>

        <div class="stats-range">
          <button v-for="item in ['hour', 'day', 'week', 'month']" :key="item" class="range-btn" :class="{ active: statsRange === item }" @click="statsRange = item as any">
            {{ item }}
          </button>
        </div>
        <TokenSeriesChart :points="activeStatsSeries" :label="`全局 token 趋势 · ${statsRange}`" />
      </div>
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
  padding: 42px 36px 56px;
}

.settings-container {
  width: min(980px, 100%);
  margin: auto;
}

.settings-hero {
  margin-bottom: 26px;
}

.settings-kicker {
  font-size: 12px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted-soft);
  margin-bottom: 10px;
}

.settings-container h2 {
  margin: 0;
  font-size: clamp(34px, 4vw, 48px);
  font-weight: 500;
  letter-spacing: -0.03em;
}

.settings-intro {
  margin: 14px 0 0;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.7;
}

.settings-card {
  background: color-mix(in srgb, var(--panel) 94%, transparent);
  border: 1px solid var(--line);
  border-radius: 24px;
  padding: 24px;
  margin-bottom: 18px;
  box-shadow: var(--shadow-soft);
  backdrop-filter: blur(16px);
}

.card-head {
  margin-bottom: 18px;
}

.settings-card h3 {
  margin: 0;
  font-size: 28px;
  font-weight: 500;
  letter-spacing: -0.02em;
}

.card-copy {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.provider-layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 18px;
}

.provider-list-panel,
.provider-editor {
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 16px;
  background: color-mix(in srgb, var(--panel) 92%, transparent);
}

.provider-list-head {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 14px;
}

.provider-list-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-strong);
}

.provider-list-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.provider-list {
  display: grid;
  gap: 10px;
}

.provider-item {
  width: 100%;
  text-align: left;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 12px;
  background: color-mix(in srgb, var(--panel) 94%, transparent);
  color: var(--text-strong);
}

.provider-item.active {
  border-color: color-mix(in srgb, var(--accent) 38%, var(--line));
  background: color-mix(in srgb, var(--accent) 10%, var(--panel));
}

.provider-item-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
}

.provider-item-sub {
  margin-top: 6px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.5;
  word-break: break-all;
}

.default-pill {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 10px;
  font-weight: 700;
}

.small-btn {
  padding: 8px 10px;
  min-height: auto;
  font-size: 12px;
}

.form-field,
.switch-field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.switch-field {
  justify-content: space-between;
  padding: 14px 16px;
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--panel) 92%, transparent);
  border-radius: 14px;
}

.form-field.full {
  grid-column: 1 / -1;
}

.form-field label {
  font-size: 12px;
  color: var(--muted-soft);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.field-hint {
  font-size: 12px;
  line-height: 1.6;
  color: var(--muted);
}

.form-field input,
.form-field select,
.form-field textarea {
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--panel) 92%, transparent);
  color: var(--text-strong);
  border-radius: 14px;
  padding: 13px 14px;
  outline: none;
  resize: vertical;
}

.form-field input:focus,
.form-field select:focus,
.form-field textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 15%, transparent);
}

.switch-list {
  margin-top: 18px;
  border-top: 1px solid var(--line);
}

.switch-list.slim {
  margin-top: 0;
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 15px 0;
  border-bottom: 1px solid var(--line);
}

.switch-row:last-child {
  border-bottom: 0;
}

.switch-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-strong);
}

.switch-desc {
  margin-top: 5px;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.6;
}

.switch {
  width: 44px;
  height: 24px;
  border-radius: 999px;
  background: var(--line);
  padding: 3px;
  cursor: pointer;
  transition: background 0.2s;
  flex: 0 0 auto;
}

.switch::after {
  content: '';
  display: block;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--canvas);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
  transition: transform 0.2s;
}

.switch.on {
  background: var(--accent);
}

.switch.on::after {
  transform: translateX(20px);
}

.actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 18px;
  flex-wrap: wrap;
}

.test-result {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 13px;
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
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--accent) 32%, var(--line));
  background: color-mix(in srgb, var(--panel) 96%, transparent);
  color: var(--text-strong);
  box-shadow: var(--shadow-pop);
  backdrop-filter: blur(18px);
}

.save-toast.success {
  border-color: color-mix(in srgb, var(--success-strong) 28%, var(--line));
}

.save-toast.error {
  border-color: color-mix(in srgb, var(--danger-strong) 28%, var(--line));
  color: var(--danger-strong);
}

.data-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: color-mix(in srgb, var(--panel) 92%, transparent);
}

.memory-empty {
  border: 1px dashed var(--line);
  border-radius: 16px;
  padding: 16px;
  color: var(--muted);
  line-height: 1.7;
  background: color-mix(in srgb, var(--panel) 90%, transparent);
}

.memory-candidate-list {
  display: grid;
  gap: 12px;
}

.memory-candidate-card {
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 14px;
  background: color-mix(in srgb, var(--panel) 92%, transparent);
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
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 11px;
}

.memory-tag.subtle {
  background: color-mix(in srgb, var(--panel) 88%, transparent);
  color: var(--muted);
  border: 1px solid var(--line);
}

.memory-candidate-text {
  color: var(--text-strong);
  line-height: 1.7;
}

.memory-candidate-actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.agent-profile-list {
  display: grid;
  gap: 14px;
}

.agent-card {
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 16px;
  background: color-mix(in srgb, var(--panel) 92%, transparent);
}

.agent-card-head {
  margin-bottom: 12px;
}

.agent-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-strong);
}

.agent-desc {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--muted);
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.stat-box {
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 14px;
  background: color-mix(in srgb, var(--panel) 92%, transparent);
}

.stat-label {
  color: var(--muted-soft);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.stat-value {
  margin-top: 10px;
  font-size: 28px;
  font-weight: 600;
  color: var(--text-strong);
}

.stats-panel {
  margin-bottom: 18px;
}

.stats-range {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.range-btn {
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 8px 12px;
  background: transparent;
  color: var(--muted);
  text-transform: uppercase;
  font-size: 11px;
}

.range-btn.active {
  background: var(--accent-soft);
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 36%, var(--line));
}

.data-path {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
  word-break: break-all;
}

@media (max-width: 900px) {
  .settings-page {
    padding: 28px 18px 36px;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .provider-layout {
    grid-template-columns: 1fr;
  }

  .form-field.full {
    grid-column: auto;
  }

  .switch-row,
  .data-panel {
    flex-direction: column;
    align-items: stretch;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>

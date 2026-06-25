<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings.store'
import { ref } from 'vue'

const settingsStore = useSettingsStore()
const testResult = ref<string | null>(null)
const saveResult = ref<string | null>(null)
const testSuccess = ref<boolean | null>(null)
const saveSuccess = ref<boolean | null>(null)

async function testConnection() {
  const result = await settingsStore.testConnection()
  testResult.value = result.message
  testSuccess.value = result.success
  setTimeout(() => {
    testResult.value = null
    testSuccess.value = null
  }, 3000)
}

async function saveConfig() {
  const result = await settingsStore.saveConfig()
  saveResult.value = result.message
  saveSuccess.value = result.success
  setTimeout(() => {
    saveResult.value = null
    saveSuccess.value = null
  }, 3000)
}
</script>

<template>
  <div class="settings-page">
    <div class="settings-container">
      <div class="settings-hero">
        <div class="settings-kicker">Settings</div>
        <h2 class="display-serif">模型、权限与本地数据</h2>
      </div>

      <div class="settings-card">
        <h3 class="display-serif">DeepSeek API</h3>
        <div class="form-grid">
          <div class="form-field">
            <label>服务商</label>
            <select v-model="settingsStore.provider">
              <option>DeepSeek</option>
            </select>
          </div>
          <div class="form-field">
            <label>模型名称</label>
            <select v-model="settingsStore.modelName">
              <option value="deepseek-v4-flash">deepseek-v4-flash</option>
              <option value="deepseek-v4-pro">deepseek-v4-pro</option>
            </select>
          </div>
          <div class="form-field full">
            <label>Base URL</label>
            <input v-model="settingsStore.baseUrl" />
          </div>
          <div class="form-field full">
            <label>API Key</label>
            <input type="password" v-model="settingsStore.apiKey" />
          </div>
        </div>
        <div class="actions">
          <button class="secondary-btn" @click="testConnection">测试连接</button>
          <button class="send-btn" @click="saveConfig">保存配置</button>
        </div>
        <div v-if="testResult" class="test-result" :class="{ success: testSuccess, error: testSuccess === false }">{{ testResult }}</div>
        <div v-if="saveResult" class="test-result" :class="{ success: saveSuccess, error: saveSuccess === false }">{{ saveResult }}</div>
      </div>

      <div class="settings-card">
        <h3 class="display-serif">任务与权限</h3>
        <div class="switch-row">
          <span>修改文件前请求确认</span>
          <div class="switch" :class="{ on: settingsStore.confirmBeforeModify }" @click="settingsStore.confirmBeforeModify = !settingsStore.confirmBeforeModify"></div>
        </div>
        <div class="switch-row">
          <span>执行命令前请求确认</span>
          <div class="switch" :class="{ on: settingsStore.confirmBeforeCommand }" @click="settingsStore.confirmBeforeCommand = !settingsStore.confirmBeforeCommand"></div>
        </div>
        <div class="switch-row">
          <span>修改文件前自动备份</span>
          <div class="switch" :class="{ on: settingsStore.autoBackup }" @click="settingsStore.autoBackup = !settingsStore.autoBackup"></div>
        </div>
        <div class="switch-row">
          <span>允许访问工作区外路径</span>
          <div class="switch" :class="{ on: settingsStore.allowOutsideWorkspace }" @click="settingsStore.allowOutsideWorkspace = !settingsStore.allowOutsideWorkspace"></div>
        </div>
      </div>

      <div class="settings-card">
        <h3 class="display-serif">本地数据</h3>
        <div class="switch-row">
          <span>数据目录</span>
          <span style="color: var(--muted)">{{ settingsStore.dataDirectory }}</span>
        </div>
        <div class="actions">
          <button class="secondary-btn">打开目录</button>
          <button class="danger-btn">清除全部数据</button>
        </div>
      </div>
    </div>
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

.settings-card {
  background: color-mix(in srgb, var(--panel) 94%, transparent);
  border: 1px solid var(--line);
  border-radius: 24px;
  padding: 24px;
  margin-bottom: 18px;
  box-shadow: var(--shadow-soft);
  backdrop-filter: blur(16px);
}

.settings-card h3 {
  margin: 0 0 18px;
  font-size: 28px;
  font-weight: 500;
  letter-spacing: -0.02em;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 7px;
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

.form-field input,
.form-field select {
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--panel) 92%, transparent);
  color: var(--text-strong);
  border-radius: 14px;
  padding: 13px 14px;
  outline: none;
}

.form-field input:focus,
.form-field select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 15%, transparent);
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px 0;
  border-top: 1px solid var(--line);
}

.switch-row:first-of-type {
  border-top: 0;
}

.switch {
  width: 44px;
  height: 24px;
  border-radius: 999px;
  background: var(--line);
  padding: 3px;
  cursor: pointer;
  transition: background 0.2s;
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

@media (max-width: 900px) {
  .settings-page {
    padding: 28px 18px 36px;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }
  .form-field.full {
    grid-column: auto;
  }
}
</style>

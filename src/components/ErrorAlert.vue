<script setup lang="ts">
import { computed } from 'vue'

type ErrorCategory = 'network' | 'provider' | 'security' | 'file' | 'task' | 'database' | 'general'

const CATEGORY_MAP: Record<string, ErrorCategory> = {
  NETWORK_ERROR: 'network',
  NETWORK_TIMEOUT: 'network',
  NETWORK_DNS: 'network',
  PROVIDER_ERROR: 'provider',
  PROVIDER_AUTH: 'provider',
  PROVIDER_QUOTA: 'provider',
  PROVIDER_RATE_LIMIT: 'provider',
  SECURITY_PATH_VIOLATION: 'security',
  SECURITY_COMMAND_BLOCKED: 'security',
  SECURITY_PERMISSION_DENIED: 'security',
  SECURITY_VALIDATION_FAILED: 'security',
  FILE_NOT_FOUND: 'file',
  FILE_READ_ERROR: 'file',
  FILE_WRITE_ERROR: 'file',
  FILE_TOO_LARGE: 'file',
  TASK_TIMEOUT: 'task',
  TASK_ROUND_LIMIT: 'task',
  TASK_TOOL_LIMIT: 'task',
  DB_NOT_FOUND: 'database',
  DB_CONSTRAINT: 'database',
  VALIDATION_ERROR: 'general',
  UNKNOWN_ERROR: 'general',
}

const CATEGORY_LABELS: Record<ErrorCategory, string> = {
  network: '网络错误',
  provider: '服务错误',
  security: '安全限制',
  file: '文件错误',
  task: '任务错误',
  database: '数据库错误',
  general: '错误',
}

const CATEGORY_STYLES: Record<ErrorCategory, { bg: string; border: string; text: string }> = {
  network: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
  provider: { bg: '#ede9fe', border: '#8b5cf6', text: '#5b21b6' },
  security: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
  file: { bg: '#e0e7ff', border: '#6366f1', text: '#3730a3' },
  task: { bg: '#ffedd5', border: '#f97316', text: '#9a3412' },
  database: { bg: '#fce7f3', border: '#ec4899', text: '#9d174d' },
  general: { bg: '#f3f4f6', border: '#6b7280', text: '#374151' },
}

const props = defineProps<{
  code?: string
  message: string
  category?: ErrorCategory
  dismissible?: boolean
}>()

const emit = defineEmits<{
  (e: 'dismiss'): void
}>()

const resolvedCategory = computed(() => {
  if (props.category) return props.category
  if (props.code) return CATEGORY_MAP[props.code] ?? 'general'
  return 'general'
})

const categoryLabel = computed(() => CATEGORY_LABELS[resolvedCategory.value])
const style = computed(() => CATEGORY_STYLES[resolvedCategory.value])
</script>

<template>
  <div
    class="error-alert"
    :style="{
      '--err-bg': style.bg,
      '--err-border': style.border,
      '--err-text': style.text,
    }"
  >
    <div class="error-content">
      <span class="error-label">{{ categoryLabel }}</span>
      <span class="error-message">{{ message }}</span>
    </div>
    <button v-if="dismissible" class="error-dismiss" @click="emit('dismiss')">×</button>
  </div>
</template>

<style scoped>
.error-alert {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 10px;
  border-left: 3px solid var(--err-border);
  background: var(--err-bg);
  color: var(--err-text);
  font-size: 13px;
  line-height: 1.5;
}

[data-theme='dark'] .error-alert {
  filter: brightness(0.85) saturate(0.9);
}

.error-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.error-label {
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.8;
}

.error-message {
  font-size: 13px;
}

.error-dismiss {
  border: 0;
  background: transparent;
  color: var(--err-text);
  font-size: 18px;
  cursor: pointer;
  padding: 0 2px;
  opacity: 0.6;
  line-height: 1;
}

.error-dismiss:hover {
  opacity: 1;
}
</style>

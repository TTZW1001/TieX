<script setup lang="ts">
import { computed } from 'vue'
import { CheckCircle2, Loader2, XCircle } from 'lucide-vue-next'
import type { ToolCallEntity } from '@/types/global'
import { getToolDisplayInfo, getToolStatusText } from '@/utils/tool-call-format'

const props = defineProps<{
  toolCall: ToolCallEntity
}>()

const display = computed(() => getToolDisplayInfo(props.toolCall))
</script>

<template>
  <div class="tool-card">
    <div class="tool-head">
      <CheckCircle2 v-if="toolCall.status === 'completed'" :size="14" class="status-icon success" />
      <Loader2 v-else-if="toolCall.status === 'running' || toolCall.status === 'pending'" :size="14" class="status-icon running" />
      <XCircle v-else :size="14" class="status-icon failed" />
      <div class="tool-title-group">
        <b>{{ display.title }}</b>
        <span>{{ display.verb }} · {{ toolCall.tool_name }}</span>
      </div>
      <span class="tool-status-text">{{ getToolStatusText(toolCall.status) }}</span>
      <span v-if="toolCall.duration_ms" class="tool-duration">{{ toolCall.duration_ms }}ms</span>
    </div>
    <div class="tool-body">
      <div class="tool-summary">
        <div class="tool-summary-main">{{ display.summary }}</div>
        <div v-if="display.detail" class="tool-summary-sub">{{ display.detail }}</div>
      </div>

      <div v-if="display.fields.length > 0" class="tool-fields">
        <div v-for="field in display.fields" :key="field.label" class="tool-field">
          <span>{{ field.label }}</span>
          <b>{{ field.value }}</b>
        </div>
      </div>

      <details v-if="display.rawArguments" class="tool-section">
        <summary>原始参数</summary>
        <pre class="code-block">{{ display.rawArguments }}</pre>
      </details>

      <details v-if="display.hasResult" class="tool-section">
        <summary>原始结果</summary>
        <pre class="code-block">{{ display.rawResult }}</pre>
      </details>

      <div v-if="toolCall.error_message" class="tool-error">
        <strong>{{ toolCall.error_code }}</strong>: {{ toolCall.error_message }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-card {
  margin-top: 12px;
  border: 1px solid var(--line);
  background: var(--panel);
  border-radius: 14px;
  overflow: hidden;
}

.tool-head {
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}

.status-icon.success {
  color: var(--success);
}

.status-icon.running {
  color: var(--accent);
  animation: spin 1s linear infinite;
}

.status-icon.failed {
  color: var(--danger);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.tool-status-text {
  margin-left: auto;
  color: var(--muted);
}

.tool-title-group {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tool-title-group b {
  color: var(--text-strong);
  font-size: 13px;
  line-height: 1.2;
}

.tool-title-group span {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.2;
}

.tool-duration {
  color: var(--muted);
  font-size: 11px;
  font-family: 'Consolas', monospace;
}

.tool-body {
  border-top: 1px solid var(--line);
  padding: 12px 14px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.7;
}

.tool-summary {
  color: var(--text);
  margin-bottom: 10px;
}

.tool-summary-main {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-strong);
  word-break: break-word;
}

.tool-summary-sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--muted);
  word-break: break-word;
}

.tool-fields {
  display: grid;
  gap: 6px;
  margin-bottom: 10px;
}

.tool-field {
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  padding: 6px 8px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg) 56%, transparent);
}

.tool-field span {
  color: var(--muted);
  font-size: 11px;
}

.tool-field b {
  color: var(--text);
  font-size: 11px;
  font-weight: 500;
  word-break: break-word;
}

.tool-section {
  margin-bottom: 8px;
}

.tool-section summary {
  cursor: pointer;
  color: var(--muted);
  font-size: 11px;
  padding: 2px 0;
  user-select: none;
}

.tool-section summary:hover {
  color: var(--text);
}

.code-block {
  margin: 4px 0;
  padding: 8px;
  background: var(--bg);
  border-radius: 6px;
  font-size: 11px;
  font-family: 'Consolas', 'Monaco', monospace;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow: auto;
  color: var(--text);
}

.tool-error {
  padding: 8px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 6px;
  color: var(--danger);
  font-size: 11px;
}
</style>

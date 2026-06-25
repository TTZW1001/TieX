<script setup lang="ts">
import { CheckCircle2, Loader2, XCircle } from 'lucide-vue-next'
import type { ToolCallEntity } from '@/types/global'

defineProps<{
  toolCall: ToolCallEntity
}>()

/** 解析参数 */
function parseArgs(args: string): Record<string, unknown> | null {
  try {
    return JSON.parse(args)
  } catch {
    return null
  }
}

/** 解析结果 */
function parseResult(result: string | null): unknown {
  if (!result) return null
  try {
    return JSON.parse(result)
  } catch {
    return result
  }
}

/** 状态文本 */
function statusText(status: string): string {
  switch (status) {
    case 'completed':
      return '已完成'
    case 'running':
      return '执行中'
    case 'failed':
      return '失败'
    case 'pending':
      return '等待中'
    default:
      return status
  }
}
</script>

<template>
  <div class="tool-card">
    <div class="tool-head">
      <CheckCircle2 v-if="toolCall.status === 'completed'" :size="14" class="status-icon success" />
      <Loader2 v-else-if="toolCall.status === 'running' || toolCall.status === 'pending'" :size="14" class="status-icon running" />
      <XCircle v-else :size="14" class="status-icon failed" />
      <b>{{ toolCall.tool_name }}</b>
      <span class="tool-status-text">{{ statusText(toolCall.status) }}</span>
      <span v-if="toolCall.duration_ms" class="tool-duration">{{ toolCall.duration_ms }}ms</span>
    </div>
    <div class="tool-body">
      <!-- 参数 -->
      <details v-if="parseArgs(toolCall.arguments)" class="tool-section">
        <summary>参数</summary>
        <pre class="code-block">{{ JSON.stringify(parseArgs(toolCall.arguments), null, 2) }}</pre>
      </details>

      <!-- 结果 -->
      <details v-if="toolCall.result" class="tool-section" open>
        <summary>结果</summary>
        <pre class="code-block">{{ JSON.stringify(parseResult(toolCall.result), null, 2) }}</pre>
      </details>

      <!-- 错误 -->
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

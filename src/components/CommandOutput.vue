<script setup lang="ts">
import { computed } from 'vue'
import { Loader2, Square, CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-vue-next'
import type { CommandSessionInfo } from '@/types/global'

const props = defineProps<{
  session: CommandSessionInfo
}>()

const emit = defineEmits<{
  stop: [sessionId: string]
}>()

/** 状态文本 */
function statusText(status: string): string {
  switch (status) {
    case 'running': return '运行中'
    case 'completed': return '已完成'
    case 'failed': return '失败'
    case 'stopped': return '已停止'
    case 'timeout': return '超时'
    default: return status
  }
}

/** 状态 CSS 类 */
function statusClass(status: string): string {
  switch (status) {
    case 'running': return 'cmd-running'
    case 'completed': return 'cmd-completed'
    case 'failed': return 'cmd-failed'
    case 'stopped': return 'cmd-stopped'
    case 'timeout': return 'cmd-timeout'
    default: return ''
  }
}

/** 状态图标 */
function statusIcon(status: string) {
  switch (status) {
    case 'running': return Loader2
    case 'completed': return CheckCircle2
    case 'failed': return XCircle
    case 'stopped': return Square
    case 'timeout': return Clock
    default: return AlertTriangle
  }
}

/** 计算执行时长 */
const duration = computed(() => {
  if (!props.session.completedAt) return null
  const start = new Date(props.session.startedAt).getTime()
  const end = new Date(props.session.completedAt).getTime()
  const ms = end - start
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
})

/** 命令显示文本 */
const commandDisplay = computed(() => {
  const parts = [props.session.command, ...props.session.args]
  return parts.join(' ')
})

/** 停止命令 */
function handleStop() {
  emit('stop', props.session.sessionId)
}
</script>

<template>
  <div class="command-output">
    <div class="cmd-head">
      <div class="cmd-info">
        <component
          :is="statusIcon(session.status)"
          :size="14"
          class="cmd-status-icon"
          :class="[statusClass(session.status), { spin: session.status === 'running' }]"
        />
        <span class="cmd-command">{{ commandDisplay }}</span>
        <span class="cmd-status-badge" :class="statusClass(session.status)">
          {{ statusText(session.status) }}
        </span>
      </div>
      <div class="cmd-meta">
        <span v-if="session.exitCode !== null" class="cmd-exit-code">
          退出码: {{ session.exitCode }}
        </span>
        <span v-if="duration" class="cmd-duration">{{ duration }}</span>
        <button
          v-if="session.status === 'running'"
          class="cmd-stop-btn"
          @click="handleStop"
        >
          <Square :size="10" /> 停止
        </button>
      </div>
    </div>
    <div class="cmd-output-area" v-if="session.output">
      <pre class="cmd-output-text">{{ session.output }}</pre>
      <div v-if="session.truncated" class="cmd-truncated">
        输出已截断（超过 50KB）
      </div>
    </div>
  </div>
</template>

<style scoped>
.command-output {
  border: 1px solid var(--line);
  background: var(--panel);
  border-radius: 10px;
  overflow: hidden;
  margin-top: 8px;
}

.cmd-head {
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px solid var(--line);
}

.cmd-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.cmd-status-icon {
  flex-shrink: 0;
}

.cmd-command {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cmd-status-badge {
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  flex-shrink: 0;
}

.cmd-running {
  color: #3b82f6;
}

.cmd-running.cmd-status-badge,
.cmd-running.cmd-status-icon {
  background: color-mix(in srgb, #3b82f6 15%, transparent);
  color: #3b82f6;
}

.cmd-completed {
  color: #22c55e;
}

.cmd-completed.cmd-status-badge {
  background: color-mix(in srgb, #22c55e 15%, transparent);
  color: #22c55e;
}

.cmd-failed {
  color: var(--danger-strong);
}

.cmd-failed.cmd-status-badge {
  background: var(--danger-soft);
  color: var(--danger-strong);
}

.cmd-stopped,
.cmd-timeout {
  color: var(--warning-strong);
}

.cmd-stopped.cmd-status-badge,
.cmd-timeout.cmd-status-badge {
  background: var(--warning-soft);
  color: var(--warning-strong);
}

.cmd-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.cmd-exit-code,
.cmd-duration {
  font-size: 10px;
  color: var(--muted);
  font-family: 'Consolas', monospace;
}

.cmd-stop-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--panel);
  color: var(--muted);
  font-size: 10px;
  cursor: pointer;
  transition: all 0.15s;
}

.cmd-stop-btn:hover {
  background: var(--danger-soft);
  color: var(--danger-strong);
  border-color: var(--danger-strong);
}

.cmd-output-area {
  position: relative;
}

.cmd-output-text {
  margin: 0;
  padding: 10px 12px;
  background: var(--code-bg);
  color: var(--code-text);
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 300px;
  overflow: auto;
}

.cmd-truncated {
  padding: 6px 12px;
  background: var(--warning-soft);
  color: var(--warning-strong);
  font-size: 10px;
  text-align: center;
  border-top: 1px solid color-mix(in srgb, var(--warning) 30%, transparent);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>

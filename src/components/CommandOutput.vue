<script setup lang="ts">
import { computed, ref } from 'vue'
import { Loader2, Square, CheckCircle2, XCircle, Clock, AlertTriangle, Copy, Check, MessageSquareText } from 'lucide-vue-next'
import type { CommandSessionInfo } from '@/types/global'
import { useUiStore } from '@/stores/ui.store'

const props = defineProps<{
  session: CommandSessionInfo
}>()

const emit = defineEmits<{
  stop: [sessionId: string]
}>()

const copiedKind = ref<'command' | 'output' | 'diagnostic' | null>(null)
let copiedTimer: ReturnType<typeof setTimeout> | null = null
const uiStore = useUiStore()

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
  const parts = [props.session.command, ...props.session.args.map(quoteArg)]
  return parts.join(' ')
})

const hasFailed = computed(() => {
  return props.session.status === 'failed' || props.session.status === 'timeout' || (props.session.exitCode !== null && props.session.exitCode !== 0)
})

const failureTitle = computed(() => {
  if (props.session.status === 'timeout') return '命令执行超时'
  if (props.session.status === 'stopped') return '命令已被停止'
  if (props.session.exitCode !== null && props.session.exitCode !== 0) return `命令以退出码 ${props.session.exitCode} 结束`
  return '命令执行失败'
})

const failureAdvice = computed(() => {
  if (props.session.status === 'timeout') return '可以检查命令是否需要交互输入、网络访问或更长执行时间。'
  if (props.session.status === 'stopped') return '如果仍需要结果，可以复制命令后重新发起任务让 Agent 继续处理。'
  if (props.session.exitCode === 127) return '常见原因是命令不存在或不在 PATH 中。'
  if (props.session.exitCode === 126) return '常见原因是文件不可执行或权限不足。'
  if (props.session.exitCode === 1) return '通常表示命令自身校验失败，建议查看输出末尾的错误信息。'
  return '建议把命令、退出码和输出一并反馈给 Agent，让它基于真实错误继续修复。'
})

const diagnosticText = computed(() => {
  const lines = [
    `命令: ${commandDisplay.value}`,
    `状态: ${statusText(props.session.status)}`,
    `退出码: ${props.session.exitCode ?? '无'}`,
    `耗时: ${duration.value ?? '未知'}`,
  ]
  if (props.session.output.trim()) {
    lines.push('', '输出:', props.session.output)
  }
  return lines.join('\n')
})

const followUpDraft = computed(() => {
  return [
    '这个命令没有成功，请基于下面的真实诊断继续排查并给出下一步修复方案。',
    '',
    '```text',
    diagnosticText.value,
    '```',
  ].join('\n')
})

function quoteArg(arg: string): string {
  if (!arg) return '""'
  if (!/[\s"`']/.test(arg)) return arg
  return `"${arg.replace(/(["\\$`])/g, '\\$1')}"`
}

async function copyText(kind: 'command' | 'output' | 'diagnostic', text: string) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    copiedKind.value = kind
    if (copiedTimer) {
      clearTimeout(copiedTimer)
    }
    copiedTimer = setTimeout(() => {
      copiedKind.value = null
      copiedTimer = null
    }, 1400)
  } catch (err) {
    console.error('Failed to copy command output:', err)
  }
}

function continueWithDiagnostic() {
  uiStore.setComposerDraft(followUpDraft.value, 'command_failure')
}

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
    <div class="cmd-actions">
      <button class="cmd-action-btn" @click="copyText('command', commandDisplay)" title="复制命令">
        <Check v-if="copiedKind === 'command'" :size="12" />
        <Copy v-else :size="12" />
        {{ copiedKind === 'command' ? '已复制' : '复制命令' }}
      </button>
      <button
        class="cmd-action-btn"
        :disabled="!session.output"
        @click="copyText('output', session.output)"
        title="复制输出"
      >
        <Check v-if="copiedKind === 'output'" :size="12" />
        <Copy v-else :size="12" />
        {{ copiedKind === 'output' ? '已复制' : '复制输出' }}
      </button>
      <button
        class="cmd-action-btn"
        :disabled="!hasFailed"
        @click="copyText('diagnostic', diagnosticText)"
        title="复制诊断信息"
      >
        <Check v-if="copiedKind === 'diagnostic'" :size="12" />
        <Copy v-else :size="12" />
        {{ copiedKind === 'diagnostic' ? '已复制' : '复制诊断' }}
      </button>
      <button
        class="cmd-action-btn primary"
        :disabled="!hasFailed && session.status !== 'stopped'"
        @click="continueWithDiagnostic"
        title="将诊断填入输入框"
      >
        <MessageSquareText :size="12" />
        继续处理
      </button>
    </div>
    <div v-if="hasFailed || session.status === 'stopped'" class="cmd-failure-note" :class="statusClass(session.status)">
      <div class="cmd-failure-title">{{ failureTitle }}</div>
      <div class="cmd-failure-advice">{{ failureAdvice }}</div>
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
  border: 1px solid color-mix(in srgb, var(--line) 84%, transparent);
  background: color-mix(in srgb, var(--panel) 92%, var(--code-bg));
  border-radius: 12px;
  overflow: hidden;
  margin-top: 8px;
}

.cmd-head {
  padding: 9px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 72%, transparent);
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
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cmd-status-badge {
  padding: 2px 7px;
  border-radius: 999px;
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
  border: 1px solid color-mix(in srgb, var(--line) 72%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--panel) 88%, var(--code-bg));
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

.cmd-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 58%, transparent);
  background: color-mix(in srgb, var(--panel) 76%, transparent);
}

.cmd-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 26px;
  padding: 5px 8px;
  border: 1px solid color-mix(in srgb, var(--line) 72%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--panel) 88%, var(--code-bg));
  color: var(--muted);
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
}

.cmd-action-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 10%, var(--panel));
  border-color: color-mix(in srgb, var(--accent) 28%, var(--line));
  color: var(--text);
}

.cmd-action-btn.primary {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 20%, var(--line));
  background: color-mix(in srgb, var(--accent) 7%, var(--panel));
}

.cmd-action-btn.primary:hover:not(:disabled) {
  color: var(--text-strong);
  border-color: color-mix(in srgb, var(--accent) 42%, var(--line));
  background: color-mix(in srgb, var(--accent) 13%, var(--panel));
}

.cmd-action-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.cmd-failure-note {
  padding: 9px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 58%, transparent);
  background: color-mix(in srgb, var(--danger) 8%, transparent);
}

.cmd-failure-note.cmd-timeout,
.cmd-failure-note.cmd-stopped {
  background: color-mix(in srgb, var(--warning) 9%, transparent);
}

.cmd-failure-title {
  color: var(--text);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.45;
}

.cmd-failure-advice {
  margin-top: 3px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
}

.cmd-output-area {
  position: relative;
}

.cmd-output-text {
  margin: 0;
  padding: 10px 12px;
  background: var(--code-block-bg);
  color: var(--code-block-text);
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 220px;
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

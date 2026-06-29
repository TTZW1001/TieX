<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle, CheckCircle2, FileOutput, FilePenLine, ShieldAlert, Terminal, Wrench } from 'lucide-vue-next'
import type { ChatMessage } from '@/stores/chat.store'
import ActivityProcessBlock, { type ProcessStreamItem } from './ActivityProcessBlock.vue'
import MarkdownContent from './MarkdownContent.vue'
import { useTaskStore } from '@/stores/task.store'

const appIconUrl = new URL('../../icon.png', import.meta.url).href
const taskStore = useTaskStore()

const props = defineProps<{
  taskId: string
  summaryMessage: ChatMessage | null
  processItems: ProcessStreamItem[]
  running: boolean
  taskTitle?: string | null
  agentBadges?: Array<{
    id: string
    label: string
    status: 'running' | 'completed' | 'failed'
  }>
}>()

const emit = defineEmits<{
  (e: 'inspect', taskId: string): void
  (e: 'inspectContext', taskId: string): void
  (e: 'inspectTab', taskId: string, tab: 'steps' | 'files' | 'changes' | 'permissions' | 'artifacts'): void
}>()

const hasProcess = computed(() => props.processItems.length > 0)

const activityEntries = computed(() => {
  return props.processItems
    .filter((item) => item.kind === 'activity')
    .map((item) => item.entry)
})

interface StructuredTaskResultSummary {
  result: string
  stats: {
    toolsTotal: number
    toolsFailed: number
    commandsTotal: number
    commandsFailed: number
    fileChangesApplied: number
    artifactsCreated: number
    permissionsPending: number
    permissionsRejected: number
  }
  createdAt: string
}

const structuredResultSummary = computed<StructuredTaskResultSummary | null>(() => {
  const steps = taskStore.stepsByTaskId[props.taskId] ?? []
  const summaryStep = [...steps].reverse().find((step) => step.step_type === 'task_result_summary' && step.content)
  if (!summaryStep?.content) return null
  try {
    const parsed = JSON.parse(summaryStep.content) as StructuredTaskResultSummary
    if (!parsed?.stats) return null
    return parsed
  } catch {
    return null
  }
})

const resultStats = computed(() => {
  const structured = structuredResultSummary.value
  if (structured) {
    return {
      toolTotal: structured.stats.toolsTotal,
      toolFailed: structured.stats.toolsFailed,
      commandTotal: structured.stats.commandsTotal,
      commandFailed: structured.stats.commandsFailed,
      fileChangeTotal: structured.stats.fileChangesApplied,
      fileChangeApplied: structured.stats.fileChangesApplied,
      fileChangeReverted: 0,
      artifactTotal: structured.stats.artifactsCreated,
      permissionWaiting: structured.stats.permissionsPending,
      permissionRejected: structured.stats.permissionsRejected,
    }
  }
  const entries = activityEntries.value
  const tools = entries.filter((entry) => entry.kind === 'tool')
  const commands = entries.filter((entry) => entry.kind === 'command')
  const permissions = entries.filter((entry) => entry.kind === 'permission')
  const fileChanges = taskStore.fileChangesByTaskId[props.taskId] ?? []
  const appliedFileChanges = fileChanges.filter((change) => change.status === 'applied')
  const revertedFileChanges = fileChanges.filter((change) => change.status === 'reverted')
  return {
    toolTotal: tools.length,
    toolFailed: tools.filter((entry) => entry.status === 'failed').length,
    commandTotal: commands.length,
    commandFailed: commands.filter((entry) => entry.status === 'failed' || entry.status === 'timeout' || entry.status === 'stopped').length,
    fileChangeTotal: fileChanges.length,
    fileChangeApplied: appliedFileChanges.length,
    fileChangeReverted: revertedFileChanges.length,
    artifactTotal: entries.filter((entry) => entry.kind === 'artifact').length,
    permissionWaiting: permissions.filter((entry) => entry.status === 'waiting').length,
    permissionRejected: permissions.filter((entry) => entry.status === 'rejected').length,
  }
})

const resultTone = computed<'running' | 'warning' | 'ok'>(() => {
  if (props.running) return 'running'
  if (
    resultStats.value.toolFailed > 0 ||
    resultStats.value.commandFailed > 0 ||
    resultStats.value.permissionWaiting > 0 ||
    resultStats.value.permissionRejected > 0
  ) {
    return 'warning'
  }
  return 'ok'
})

const resultTitle = computed(() => {
  if (resultTone.value === 'running') return '任务正在执行'
  if (resultTone.value === 'warning') return '任务需要关注'
  return '任务完成概览'
})

const resultItems = computed(() => [
  {
    key: 'tools',
    label: '工具',
    value: resultStats.value.toolTotal ? `${resultStats.value.toolTotal - resultStats.value.toolFailed}/${resultStats.value.toolTotal} 成功` : '无调用',
    tone: resultStats.value.toolFailed > 0 ? 'warning' : 'neutral',
    icon: Wrench,
    tab: 'files' as const,
    detail: '打开任务详情的工具调用页',
  },
  {
    key: 'commands',
    label: '命令',
    value: resultStats.value.commandTotal
      ? resultStats.value.commandFailed > 0
        ? `${resultStats.value.commandFailed} 个失败 / ${resultStats.value.commandTotal} 个`
        : `${resultStats.value.commandTotal}/${resultStats.value.commandTotal} 成功`
      : '无命令',
    tone: resultStats.value.commandFailed > 0 ? 'warning' : 'neutral',
    icon: Terminal,
    tab: 'files' as const,
    detail: '打开任务详情的工具调用页查看命令输出',
  },
  {
    key: 'files',
    label: '文件',
    value: resultStats.value.fileChangeTotal
      ? resultStats.value.fileChangeReverted > 0
        ? `${resultStats.value.fileChangeApplied} 生效 / ${resultStats.value.fileChangeReverted} 回滚`
        : `${resultStats.value.fileChangeApplied} 个变更`
      : '无变更',
    tone: resultStats.value.fileChangeApplied > 0 ? 'ok' : 'neutral',
    icon: FilePenLine,
    tab: 'changes' as const,
    detail: '打开任务详情的文件变更页',
  },
  {
    key: 'artifacts',
    label: '产物',
    value: resultStats.value.artifactTotal ? `${resultStats.value.artifactTotal} 个` : '无产物',
    tone: resultStats.value.artifactTotal > 0 ? 'ok' : 'neutral',
    icon: FileOutput,
    tab: 'artifacts' as const,
    detail: '打开任务详情的生成物页',
  },
  {
    key: 'permissions',
    label: '确认',
    value: resultStats.value.permissionWaiting || resultStats.value.permissionRejected
      ? `${resultStats.value.permissionWaiting} 待处理 / ${resultStats.value.permissionRejected} 拒绝`
      : '无阻塞',
    tone: resultStats.value.permissionWaiting || resultStats.value.permissionRejected ? 'warning' : 'neutral',
    icon: ShieldAlert,
    tab: 'permissions' as const,
    detail: '打开任务详情的确认页',
  },
])
</script>

<template>
  <div class="message task-message">
    <div class="avatar ai">
      <img :src="appIconUrl" alt="TieX logo" />
    </div>

    <div class="bubble">
      <div class="author-row">
        <div class="author-group">
          <div class="author">TieX</div>
          <div class="author-subtitle">主对话 Agent 最终回复</div>
        </div>
        <div v-if="agentBadges?.length" class="agent-badge-row">
          <span
            v-for="badge in agentBadges"
            :key="badge.id"
            class="agent-badge"
            :class="`status-${badge.status}`"
          >
            {{ badge.label }}
          </span>
        </div>
      </div>

      <ActivityProcessBlock
        v-if="hasProcess"
        :items="processItems"
        :running="running"
      />

      <section v-if="hasProcess" class="result-overview" :class="`tone-${resultTone}`">
        <div class="result-overview-head">
          <div class="result-title-group">
            <CheckCircle2 v-if="resultTone === 'ok'" :size="15" />
            <AlertTriangle v-else :size="15" />
            <span>{{ resultTitle }}</span>
          </div>
          <button class="result-link" type="button" @click="emit('inspect', taskId)">
            查看明细
          </button>
        </div>
        <div class="result-grid">
          <button
            v-for="item in resultItems"
            :key="item.key"
            class="result-item"
            :class="`tone-${item.tone}`"
            type="button"
            :title="item.detail"
            :aria-label="`${item.label}：${item.value}。${item.detail}`"
            @click="emit('inspectTab', taskId, item.tab)"
          >
            <component :is="item.icon" :size="14" />
            <div>
              <span>{{ item.label }}</span>
              <b>{{ item.value }}</b>
            </div>
          </button>
        </div>
      </section>

      <MarkdownContent
        v-if="summaryMessage?.content"
        class="bubble-content final-summary"
        :content="summaryMessage.content"
      />

      <div class="message-actions">
        <button class="inspect-btn" type="button" @click="emit('inspect', taskId)">
          查看任务详情
        </button>
        <button class="inspect-btn context-btn" type="button" @click="emit('inspectContext', taskId)">
          查看上下文
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.message {
  display: flex;
  gap: 16px;
  margin-bottom: 28px;
  align-items: flex-start;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: #faf6ed;
  color: #1d1b19;
  overflow: hidden;
  border: 1px solid var(--sidebar-border);
  display: grid;
  place-items: center;
  flex: 0 0 auto;
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.bubble {
  min-width: 0;
  max-width: 780px;
}

.author-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.author-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.author {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: var(--sidebar-text-muted);
}

.author-subtitle {
  font-size: 12px;
  color: var(--sidebar-text-muted);
}

.agent-badge-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.agent-badge {
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 11px;
  border: 1px solid var(--sidebar-border);
  background: color-mix(in srgb, var(--sidebar-surface) 92%, transparent);
  color: var(--sidebar-text-muted);
  display: inline-flex;
  align-items: center;
}

.agent-badge.status-running {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 14%, var(--sidebar-border));
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.agent-badge.status-completed {
  color: var(--success-strong);
  border-color: color-mix(in srgb, var(--success) 14%, var(--sidebar-border));
  background: color-mix(in srgb, var(--success) 8%, transparent);
}

.agent-badge.status-failed {
  color: var(--danger-strong);
  border-color: color-mix(in srgb, var(--danger) 14%, var(--sidebar-border));
  background: color-mix(in srgb, var(--danger) 8%, transparent);
}

.final-summary {
  margin-top: 14px;
  line-height: 1.75;
  font-size: 15px;
}

.final-summary:first-child {
  margin-top: 0;
}

.result-overview {
  margin-top: 14px;
  border: 1px solid var(--sidebar-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--sidebar-surface) 92%, transparent);
  overflow: hidden;
}

.result-overview.tone-ok {
  border-color: color-mix(in srgb, var(--success) 18%, var(--sidebar-border));
}

.result-overview.tone-warning {
  border-color: color-mix(in srgb, var(--warning) 22%, var(--sidebar-border));
}

.result-overview.tone-running {
  border-color: color-mix(in srgb, var(--accent) 20%, var(--sidebar-border));
}

.result-overview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--sidebar-border) 70%, transparent);
}

.result-title-group {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--text-strong);
  font-size: 13px;
  font-weight: 700;
}

.tone-ok .result-title-group {
  color: var(--success-strong);
}

.tone-warning .result-title-group {
  color: var(--warning-strong);
}

.tone-running .result-title-group {
  color: var(--accent);
}

.result-link {
  flex: 0 0 auto;
  border: 0;
  background: transparent;
  color: var(--sidebar-text-muted);
  font-size: 12px;
  cursor: pointer;
}

.result-link:hover {
  color: var(--text-strong);
}

.result-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 1px;
  background: color-mix(in srgb, var(--sidebar-border) 54%, transparent);
}

.result-item {
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 11px;
  border: 0;
  background: color-mix(in srgb, var(--sidebar-surface) 96%, transparent);
  color: var(--sidebar-text-muted);
  text-align: left;
  cursor: pointer;
  font: inherit;
  transition: background-color var(--duration-fast) var(--ease-out);
}

.result-item:hover {
  background: color-mix(in srgb, var(--accent) 7%, var(--sidebar-surface));
}

.result-item:focus-visible {
  position: relative;
  z-index: 1;
  outline: 2px solid color-mix(in srgb, var(--accent) 52%, transparent);
  outline-offset: -2px;
}

.result-item.tone-ok {
  color: var(--success-strong);
}

.result-item.tone-warning {
  color: var(--warning-strong);
}

.result-item div {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.result-item span {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.3;
}

.result-item b {
  color: var(--text);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.35;
  word-break: break-word;
}

.message-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.inspect-btn {
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--sidebar-border);
  background: color-mix(in srgb, var(--sidebar-surface) 92%, transparent);
  color: var(--sidebar-text-soft);
  font-size: 12px;
  cursor: pointer;
  transition:
    border-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out),
    background var(--duration-fast) var(--ease-out);
}

.inspect-btn:hover {
  color: var(--text-strong);
  border-color: color-mix(in srgb, var(--accent) 18%, var(--sidebar-border));
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.context-btn {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 16%, var(--sidebar-border));
  background: color-mix(in srgb, var(--accent) 6%, transparent);
}

@media (max-width: 720px) {
  .result-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>

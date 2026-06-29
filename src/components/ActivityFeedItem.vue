<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock3,
  ShieldAlert,
  FileOutput,
  Wrench,
  AlertTriangle,
  ChevronRight,
} from 'lucide-vue-next'
import CommandOutput from './CommandOutput.vue'
import ArtifactCard from './ArtifactCard.vue'
import MarkdownContent from './MarkdownContent.vue'
import { useTaskStore } from '@/stores/task.store'
import { useUiStore } from '@/stores/ui.store'
import type { ArtifactInfo, CommandSessionInfo, PermissionDecision, PermissionRequestInfo } from '@/types/global'
import {
  buildPermissionFields,
  getApprovalScopeText,
  getManualPlanDraft,
  getPermissionRiskClass,
  getPermissionRiskText,
} from '@/utils/permission-display'

export type ActivityEntry =
  | {
      id: string
      kind: 'task'
      createdAt: string
      title: string
      status: 'running' | 'completed' | 'failed' | 'stopped'
      detail?: string
    }
  | {
      id: string
      kind: 'agent'
      createdAt: string
      title: string
      status: 'running' | 'completed' | 'failed'
      detail?: string
    }
  | {
      id: string
      kind: 'permission'
      createdAt: string
      title: string
      status: 'waiting' | 'approved' | 'rejected'
      detail?: string
      requestId: string
    }
  | {
      id: string
      kind: 'tool'
      createdAt: string
      title: string
      status: 'running' | 'completed' | 'failed'
      detail?: string
    }
  | {
      id: string
      kind: 'command'
      createdAt: string
      title: string
      status: 'running' | 'completed' | 'failed' | 'stopped' | 'timeout'
      sessionId: string
      detail?: string
    }
  | {
      id: string
      kind: 'artifact'
      createdAt: string
      title: string
      status: 'completed'
      artifactId: string
      detail?: string
    }

const { entry } = defineProps<{
  entry: ActivityEntry
}>()

const taskStore = useTaskStore()
const uiStore = useUiStore()
const processingPermissionId = ref<string | null>(null)
const rejectionReasons = ref<Record<string, string>>({})
const activePermissionId = computed(() => uiStore.currentPermissionRequest?.requestId || null)

function kindLabel(kind: ActivityEntry['kind']): string {
  switch (kind) {
    case 'task': return '任务'
    case 'tool': return '工具'
    case 'command': return '命令'
    case 'permission': return '确认'
    case 'agent': return 'Agent'
    case 'artifact': return '产物'
    default: return kind
  }
}

function entryIcon(entry: ActivityEntry) {
  if (entry.kind === 'command') {
    if (entry.status === 'running') return Loader2
    if (entry.status === 'completed') return CheckCircle2
    if (entry.status === 'timeout' || entry.status === 'stopped') return Clock3
    return XCircle
  }
  if (entry.kind === 'permission') {
    if (entry.status === 'waiting') return ShieldAlert
    if (entry.status === 'approved') return CheckCircle2
    return XCircle
  }
  if (entry.kind === 'artifact') return FileOutput
  if (entry.kind === 'agent') {
    if (entry.status === 'running') return Loader2
    if (entry.status === 'completed') return CheckCircle2
    return XCircle
  }
  if (entry.kind === 'tool') {
    if (entry.status === 'running') return Wrench
    if (entry.status === 'completed') return CheckCircle2
    return XCircle
  }
  if (entry.status === 'running') return Loader2
  if (entry.status === 'completed') return CheckCircle2
  if (entry.status === 'stopped') return Clock3
  return AlertTriangle
}

function statusLabel(entry: ActivityEntry): string {
  switch (entry.status) {
    case 'running': return '进行中'
    case 'completed': return '已完成'
    case 'failed': return '失败'
    case 'waiting': return '等待确认'
    case 'approved': return '已批准'
    case 'rejected': return '已拒绝'
    case 'stopped': return '已停止'
    case 'timeout': return '超时'
    default: return ''
  }
}

function statusClass(entry: ActivityEntry): string {
  return `status-${entry.status}`
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getCommandSession(sessionId: string): CommandSessionInfo | null {
  return taskStore.commandSessions.get(sessionId) || null
}

function getArtifact(artifactId: string): ArtifactInfo | null {
  return taskStore.artifacts.find((artifact) => artifact.id === artifactId) || null
}

function getPermissionRequest(requestId: string): PermissionRequestInfo | null {
  return taskStore.permissionRequests.find((request) => request.id === requestId) || null
}

function permissionFields(request: PermissionRequestInfo) {
  return buildPermissionFields({
    reason: request.reason,
    target: request.target,
    impactSummary: request.impact_summary,
    permissionType: request.permission_type,
  })
}

function isExpandable(entry: ActivityEntry): boolean {
  if (entry.kind === 'permission' && entry.status === 'waiting') return true
  if (entry.kind === 'command') return !!getCommandSession(entry.sessionId)?.output
  if (entry.kind === 'artifact') return !!getArtifact(entry.artifactId)
  return !!entry.detail
}

function defaultExpanded(entry: ActivityEntry): boolean {
  return (entry.kind === 'permission' && entry.status === 'waiting') || entry.kind === 'command' || entry.kind === 'agent'
}

async function submitPermissionDecision(request: PermissionRequestInfo, decision: PermissionDecision, decisionReason?: string | null) {
  if (processingPermissionId.value) return
  processingPermissionId.value = request.id
  try {
    await window.tiex.permission.decide(request.id, decision, decisionReason)
    if (uiStore.currentPermissionRequest?.requestId === request.id) {
      uiStore.closePermissionDialog()
    }
    if (taskStore.currentTask?.id) {
      await taskStore.loadPermissionRequests(taskStore.currentTask.id)
    }
  } finally {
    processingPermissionId.value = null
  }
}

async function handleManualPlan(request: PermissionRequestInfo) {
  const userReason = rejectionReasons.value[request.id] ?? ''
  uiStore.setComposerDraft(getManualPlanDraft({
    reason: request.reason,
    target: request.target,
    impactSummary: request.impact_summary,
    userReason,
  }), 'manual_plan')
  await submitPermissionDecision(request, 'rejected', userReason)
}

async function handleReject(request: PermissionRequestInfo) {
  const userReason = rejectionReasons.value[request.id]?.trim() ?? ''
  if (userReason) {
    uiStore.setComposerDraft(getManualPlanDraft({
      reason: request.reason,
      target: request.target,
      impactSummary: request.impact_summary,
      userReason,
    }), 'permission_rejection')
  }
  await submitPermissionDecision(request, 'rejected', userReason)
}
</script>

<template>
  <div class="activity-row" :class="statusClass(entry)">
    <div class="activity-rail" />
    <div class="activity-node">
      <component
        :is="entryIcon(entry)"
        :size="13"
        class="activity-icon"
        :class="{ spin: entry.status === 'running' }"
      />
    </div>

    <details v-if="isExpandable(entry)" class="activity-body" :open="defaultExpanded(entry)">
      <summary class="activity-summary">
        <div class="activity-line">
          <span class="activity-kind">{{ kindLabel(entry.kind) }}</span>
          <span class="activity-title">{{ entry.title }}</span>
          <span class="activity-time">{{ formatTime(entry.createdAt) }}</span>
          <span class="activity-badge" :class="statusClass(entry)">{{ statusLabel(entry) }}</span>
          <span
            v-if="entry.kind === 'permission' && activePermissionId === entry.requestId"
            class="activity-badge status-waiting active-badge"
          >
            等你处理
          </span>
        </div>
        <ChevronRight :size="14" class="activity-caret" />
      </summary>

      <div class="activity-panel">
        <MarkdownContent v-if="entry.detail" class="activity-detail" :content="entry.detail" />

        <div
          v-if="entry.kind === 'permission' && entry.status === 'waiting' && getPermissionRequest(entry.requestId)"
          class="permission-actions"
        >
          <div class="permission-review">
            <div class="permission-review-head">
              <span>审批信息</span>
              <b :class="getPermissionRiskClass(getPermissionRequest(entry.requestId)!.risk_level)">
                {{ getPermissionRiskText(getPermissionRequest(entry.requestId)!.risk_level) }}
              </b>
            </div>
            <div class="permission-facts">
              <div
                v-for="field in permissionFields(getPermissionRequest(entry.requestId)!)"
                :key="field.label"
                class="permission-fact"
              >
                <span>{{ field.label }}</span>
                <b>{{ field.value }}</b>
              </div>
            </div>
            <div class="permission-scope-notes">
              <p>{{ getApprovalScopeText('once') }}</p>
              <p>{{ getApprovalScopeText('conversation') }}</p>
            </div>
            <label class="permission-rejection">
              <span>拒绝说明（可选）</span>
              <textarea
                v-model="rejectionReasons[getPermissionRequest(entry.requestId)!.id]"
                rows="2"
                placeholder="写下为什么不允许，TieX 会把它带到下一轮方案里。"
              />
            </label>
          </div>
          <button
            class="secondary-btn"
            :disabled="processingPermissionId === entry.requestId"
            @click="submitPermissionDecision(getPermissionRequest(entry.requestId)!, 'approved_once')"
          >
            允许一次
          </button>
          <button
            class="secondary-btn"
            :disabled="processingPermissionId === entry.requestId"
            @click="submitPermissionDecision(getPermissionRequest(entry.requestId)!, 'approved_for_conversation')"
          >
            本次会话内允许
          </button>
          <button
            class="secondary-btn"
            :disabled="processingPermissionId === entry.requestId"
            @click="handleManualPlan(getPermissionRequest(entry.requestId)!)"
          >
            改成人工方案
          </button>
          <button
            class="danger-btn"
            :disabled="processingPermissionId === entry.requestId"
            @click="handleReject(getPermissionRequest(entry.requestId)!)"
          >
            拒绝
          </button>
        </div>

        <CommandOutput
          v-if="entry.kind === 'command' && getCommandSession(entry.sessionId)"
          :session="getCommandSession(entry.sessionId)!"
        />

        <ArtifactCard
          v-if="entry.kind === 'artifact' && getArtifact(entry.artifactId)"
          :artifact="getArtifact(entry.artifactId)!"
        />
      </div>
    </details>

    <div v-else class="activity-body static">
      <div class="activity-line">
        <span class="activity-kind">{{ kindLabel(entry.kind) }}</span>
        <span class="activity-title">{{ entry.title }}</span>
        <span class="activity-time">{{ formatTime(entry.createdAt) }}</span>
        <span class="activity-badge" :class="statusClass(entry)">{{ statusLabel(entry) }}</span>
      </div>
      <MarkdownContent v-if="entry.detail" class="activity-detail" :content="entry.detail" />
    </div>
  </div>
</template>

<style scoped>
.activity-row {
  position: relative;
  display: grid;
  grid-template-columns: 24px 1fr;
  column-gap: 12px;
  padding: 0 0 10px;
  margin: 4px 0 10px;
}

.activity-row.last-activity .activity-rail {
  display: none;
}

.activity-rail {
  position: absolute;
  left: 11px;
  top: 22px;
  bottom: -10px;
  width: 1px;
  background: color-mix(in srgb, var(--line) 82%, transparent);
}

.activity-node {
  position: relative;
  z-index: 1;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--panel-2) 88%, transparent);
  border: 1px solid var(--line);
  display: grid;
  place-items: center;
}

.activity-body {
  min-width: 0;
  padding-top: 1px;
}

.activity-summary {
  list-style: none;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  cursor: pointer;
}

.activity-summary::-webkit-details-marker {
  display: none;
}

.activity-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.activity-kind {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted-soft);
}

.activity-title {
  min-width: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-strong);
  font-weight: 600;
}

.activity-time {
  font-size: 12px;
  color: var(--muted);
}

.activity-badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid transparent;
}

.activity-caret {
  margin-left: auto;
  margin-top: 2px;
  color: var(--muted-soft);
  flex: 0 0 auto;
  transition: transform var(--duration-fast) var(--ease-out);
}

details[open] > .activity-summary .activity-caret {
  transform: rotate(90deg);
}

.activity-panel {
  margin-top: 8px;
  padding: 10px 12px 12px;
  border-radius: 14px;
  border: 1px solid var(--line-soft);
  background: color-mix(in srgb, var(--panel) 64%, transparent);
}

.activity-detail {
  margin-top: 4px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--muted);
}

.activity-detail :deep(p) {
  margin: 0 0 10px;
}

.activity-detail :deep(p:last-child) {
  margin-bottom: 0;
}

.status-running .activity-node {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 30%, var(--line));
}

.status-completed .activity-node,
.status-approved .activity-node {
  color: var(--success-strong);
  border-color: color-mix(in srgb, var(--success) 28%, var(--line));
}

.status-failed .activity-node,
.status-rejected .activity-node {
  color: var(--danger-strong);
  border-color: color-mix(in srgb, var(--danger) 28%, var(--line));
}

.status-waiting .activity-node,
.status-stopped .activity-node,
.status-timeout .activity-node {
  color: var(--warning-strong);
  border-color: color-mix(in srgb, var(--warning) 28%, var(--line));
}

.status-running.activity-badge {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.status-completed.activity-badge,
.status-approved.activity-badge {
  color: var(--success-strong);
  background: color-mix(in srgb, var(--success) 12%, transparent);
}

.status-failed.activity-badge,
.status-rejected.activity-badge {
  color: var(--danger-strong);
  background: color-mix(in srgb, var(--danger) 12%, transparent);
}

.status-waiting.activity-badge,
.status-stopped.activity-badge,
.status-timeout.activity-badge {
  color: var(--warning-strong);
  background: color-mix(in srgb, var(--warning) 12%, transparent);
}

.active-badge {
  border-color: color-mix(in srgb, var(--warning) 30%, transparent);
}

.activity-icon.spin {
  animation: activitySpin 1s linear infinite;
}

.permission-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.permission-review {
  flex: 1 0 100%;
  display: grid;
  gap: 8px;
  margin-bottom: 4px;
}

.permission-review-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.permission-review-head span {
  color: var(--text-strong);
  font-size: 12px;
  font-weight: 700;
}

.permission-review-head b {
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 10px;
}

.permission-review-head b.high,
.permission-review-head b.blocked {
  color: var(--danger-strong);
  background: var(--danger-soft);
}

.permission-review-head b.medium {
  color: var(--warning-strong);
  background: var(--warning-soft);
}

.permission-review-head b.low {
  color: var(--success-strong);
  background: var(--success-soft);
}

.permission-facts {
  display: grid;
  gap: 6px;
}

.permission-fact {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--line) 68%, transparent);
  background: color-mix(in srgb, var(--panel-2) 84%, transparent);
}

.permission-fact span {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.45;
}

.permission-fact b {
  color: var(--text);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;
  word-break: break-word;
}

.permission-scope-notes {
  display: grid;
  gap: 5px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
}

.permission-scope-notes p {
  margin: 0;
}

.permission-rejection {
  display: grid;
  gap: 6px;
}

.permission-rejection span {
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
}

.permission-rejection textarea {
  width: 100%;
  resize: vertical;
  min-height: 54px;
  border: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
  border-radius: 10px;
  padding: 8px 10px;
  background: color-mix(in srgb, var(--panel-2) 78%, transparent);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  line-height: 1.45;
  outline: none;
}

.permission-rejection textarea:focus {
  border-color: color-mix(in srgb, var(--accent) 28%, var(--line));
}

.permission-actions button {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

@keyframes activitySpin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>

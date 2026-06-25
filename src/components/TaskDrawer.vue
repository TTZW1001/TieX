<script setup lang="ts">
import { ref, watch } from 'vue'
import { useUiStore } from '@/stores/ui.store'
import { useTaskStore } from '@/stores/task.store'
import { X, Loader2, CheckCircle2, XCircle, AlertCircle, RotateCcw, FileText } from 'lucide-vue-next'
import DiffViewer from './DiffViewer.vue'
import ArtifactCard from './ArtifactCard.vue'
import CommandOutput from './CommandOutput.vue'
import type { FileChangeInfo, ArtifactInfo, CommandSessionInfo } from '@/types/global'

const uiStore = useUiStore()
const taskStore = useTaskStore()

const fileChanges = ref<FileChangeInfo[]>([])
const loadingChanges = ref(false)
const restoringId = ref<string | null>(null)
const artifacts = ref<ArtifactInfo[]>([])
const loadingArtifacts = ref(false)

// 监听当前任务变化，加载文件变更和生成物
watch(() => taskStore.currentTask?.id, async (taskId) => {
  if (taskId) {
    await Promise.all([loadFileChanges(taskId), loadArtifacts(taskId)])
  } else {
    fileChanges.value = []
    artifacts.value = []
  }
}, { immediate: true })

async function loadFileChanges(taskId: string) {
  loadingChanges.value = true
  try {
    fileChanges.value = await window.tiex.fileChange.getByTask(taskId)
  } catch (err) {
    console.error('Failed to load file changes:', err)
    fileChanges.value = []
  } finally {
    loadingChanges.value = false
  }
}

async function loadArtifacts(taskId: string) {
  loadingArtifacts.value = true
  try {
    artifacts.value = await window.tiex.artifact.getByTask(taskId)
  } catch (err) {
    console.error('Failed to load artifacts:', err)
    artifacts.value = []
  } finally {
    loadingArtifacts.value = false
  }
}

async function restoreChange(change: FileChangeInfo) {
  if (restoringId.value) return
  restoringId.value = change.id
  try {
    const result = await window.tiex.fileChange.restore(change.id)
    if (result.success) {
      // 刷新文件变更列表
      if (taskStore.currentTask?.id) {
        await loadFileChanges(taskStore.currentTask.id)
      }
    } else if (result.conflict) {
      alert(`恢复失败: ${result.message || '文件在修改后又被更改，存在冲突'}`)
    } else {
      alert(`恢复失败: ${result.message || '未知错误'}`)
    }
  } catch (err: any) {
    alert(`恢复失败: ${err?.message || '未知错误'}`)
  } finally {
    restoringId.value = null
  }
}

/** 格式化时间 */
function formatTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/** 解析工具调用参数 */
function parseArgs(args: string): string {
  try {
    const obj = JSON.parse(args)
    return JSON.stringify(obj, null, 2)
  } catch {
    return args
  }
}

/** 解析工具调用结果 */
function parseResult(result: string | null): string {
  if (!result) return ''
  try {
    const obj = JSON.parse(result)
    return JSON.stringify(obj, null, 2)
  } catch {
    return result
  }
}

/** 从工具调用结果中提取命令会话信息 */
function extractCommandSession(call: { tool_name: string; result: string | null; arguments: string }): CommandSessionInfo | null {
  if (call.tool_name !== 'run_command') return null
  if (!call.result) return null
  try {
    const obj = JSON.parse(call.result)
    if (obj.sessionId) {
      return {
        sessionId: obj.sessionId,
        command: obj.command || '',
        args: obj.args || [],
        status: obj.status || 'completed',
        exitCode: obj.exitCode ?? null,
        output: obj.output || '',
        truncated: obj.truncated || false,
        startedAt: obj.startedAt || new Date().toISOString(),
        completedAt: obj.completedAt || null,
      }
    }
  } catch {}
  return null
}

/** 停止命令 */
async function stopCommand(sessionId: string) {
  try {
    await window.tiex.command.stop(sessionId)
  } catch (err) {
    console.error('Failed to stop command:', err)
  }
}
</script>

<template>
  <aside class="right-drawer">
    <div class="drawer-inner">
      <div class="drawer-head">
        <span>任务详情</span>
        <button class="icon-btn" style="margin-left: auto" @click="uiStore.toggleDrawer">
          <X :size="16" />
        </button>
      </div>

      <!-- 任务概览 -->
      <div class="task-summary" v-if="taskStore.currentTask">
        <div class="task-title">{{ taskStore.currentTask.title || '未命名任务' }}</div>
        <div class="task-meta">
          <span class="task-status" :class="`status-${taskStore.currentTask.status}`">
            {{ taskStore.currentTask.status }}
          </span>
          <span class="meta-item">轮次: {{ taskStore.currentTask.roundCount }}</span>
          <span class="meta-item">工具: {{ taskStore.currentTask.toolCallCount }}</span>
        </div>
      </div>

      <div class="drawer-tabs">
        <button
          class="drawer-tab"
          :class="{ active: uiStore.activeDrawerTab === 'steps' }"
          @click="uiStore.setDrawerTab('steps')"
        >
          步骤
        </button>
        <button
          class="drawer-tab"
          :class="{ active: uiStore.activeDrawerTab === 'files' }"
          @click="uiStore.setDrawerTab('files')"
        >
          工具调用
        </button>
        <button
          class="drawer-tab"
          :class="{ active: uiStore.activeDrawerTab === 'changes' }"
          @click="uiStore.setDrawerTab('changes')"
        >
          文件变更
        </button>
        <button
          class="drawer-tab"
          :class="{ active: uiStore.activeDrawerTab === 'artifacts' }"
          @click="uiStore.setDrawerTab('artifacts')"
        >
          生成物
        </button>
        <button
          class="drawer-tab"
          :class="{ active: uiStore.activeDrawerTab === 'logs' }"
          @click="uiStore.setDrawerTab('logs')"
        >
          日志
        </button>
      </div>
      <div class="drawer-list">
        <!-- 空状态 -->
        <div v-if="!taskStore.currentTask" class="empty-drawer">
          <AlertCircle :size="32" />
          <div>暂无任务</div>
        </div>

        <template v-else>
          <!-- Steps tab -->
          <template v-if="uiStore.activeDrawerTab === 'steps'">
            <div
              v-for="step in taskStore.steps"
              :key="step.id"
              class="step-row"
            >
              <span class="step-icon">
                <CheckCircle2 v-if="step.status === 'completed'" :size="16" class="status-ok" />
                <Loader2 v-else-if="step.status === 'running'" :size="16" class="status-running spin" />
                <XCircle v-else-if="step.status === 'failed'" :size="16" class="status-fail" />
                <span v-else class="status-wait">●</span>
              </span>
              <div class="step-content">
                <div class="step-title">{{ step.content }}</div>
                <div class="step-sub">
                  <span class="step-type">{{ step.step_type }}</span>
                  <span v-if="step.started_at">{{ formatTime(step.started_at) }}</span>
                </div>
              </div>
            </div>
            <div v-if="taskStore.steps.length === 0" class="empty-tab">暂无步骤</div>
          </template>

          <!-- Tool Calls tab -->
          <template v-if="uiStore.activeDrawerTab === 'files'">
            <div
              v-for="call in taskStore.toolCalls"
              :key="call.id"
              class="toolcall-row"
            >
              <!-- run_command 使用 CommandOutput 组件 -->
              <template v-if="call.tool_name === 'run_command'">
                <div class="toolcall-head">
                  <span class="tool-name">{{ call.tool_name }}</span>
                  <span class="tool-status" :class="`ts-${call.status}`">{{ call.status }}</span>
                </div>
                <details class="toolcall-details">
                  <summary>参数</summary>
                  <pre class="code-block">{{ parseArgs(call.arguments) }}</pre>
                </details>
                <CommandOutput
                  v-if="extractCommandSession(call)"
                  :session="extractCommandSession(call)!"
                  @stop="stopCommand"
                />
                <div v-if="call.error_message" class="toolcall-error">
                  {{ call.error_message }}
                </div>
                <div v-if="call.duration_ms" class="toolcall-duration">
                  耗时: {{ call.duration_ms }}ms
                </div>
              </template>
              <!-- 其他工具使用原有展示 -->
              <template v-else>
                <div class="toolcall-head">
                  <span class="tool-name">{{ call.tool_name }}</span>
                  <span class="tool-status" :class="`ts-${call.status}`">{{ call.status }}</span>
                </div>
                <details class="toolcall-details">
                  <summary>参数</summary>
                  <pre class="code-block">{{ parseArgs(call.arguments) }}</pre>
                </details>
                <details v-if="call.result" class="toolcall-details">
                  <summary>结果</summary>
                  <pre class="code-block">{{ parseResult(call.result) }}</pre>
                </details>
                <div v-if="call.error_message" class="toolcall-error">
                  {{ call.error_message }}
                </div>
                <div v-if="call.duration_ms" class="toolcall-duration">
                  耗时: {{ call.duration_ms }}ms
                </div>
              </template>
            </div>
            <div v-if="taskStore.toolCalls.length === 0" class="empty-tab">暂无工具调用</div>
          </template>

          <!-- File Changes tab -->
          <template v-if="uiStore.activeDrawerTab === 'changes'">
            <div v-if="loadingChanges" class="empty-tab">
              <Loader2 :size="16" class="spin" style="vertical-align: -3px" /> 加载中...
            </div>
            <template v-else>
              <div
                v-for="change in fileChanges"
                :key="change.id"
                class="change-card"
              >
                <div class="change-head">
                  <FileText :size="14" style="flex-shrink: 0; margin-top: 2px" />
                  <span class="change-path">{{ change.relative_path }}</span>
                  <span class="change-op" :class="`op-${change.operation}`">{{ change.operation }}</span>
                  <span v-if="change.status === 'reverted'" class="change-reverted">已恢复</span>
                </div>
                <DiffViewer :change="change" />
                <div class="change-actions" v-if="change.status === 'applied'">
                  <button
                    class="restore-btn"
                    @click="restoreChange(change)"
                    :disabled="restoringId === change.id"
                  >
                    <RotateCcw :size="12" style="vertical-align: -1px" />
                    {{ restoringId === change.id ? '恢复中...' : '恢复此文件' }}
                  </button>
                </div>
              </div>
              <div v-if="fileChanges.length === 0" class="empty-tab">暂无文件变更</div>
            </template>
          </template>

          <!-- Artifacts tab -->
          <template v-if="uiStore.activeDrawerTab === 'artifacts'">
            <div v-if="loadingArtifacts" class="empty-tab">
              <Loader2 :size="16" class="spin" style="vertical-align: -3px" /> 加载中...
            </div>
            <template v-else>
              <ArtifactCard
                v-for="artifact in artifacts"
                :key="artifact.id"
                :artifact="artifact"
              />
              <div v-if="artifacts.length === 0" class="empty-tab">暂无生成物</div>
            </template>
          </template>

          <!-- Logs tab -->
          <template v-if="uiStore.activeDrawerTab === 'logs'">
            <div
              v-for="log in taskStore.logs"
              :key="log.id"
              class="log-row"
              :class="`log-${log.level}`"
            >
              <span class="log-time">{{ formatTime(log.created_at) }}</span>
              <div class="log-content">
                <div class="log-message">{{ log.message }}</div>
                <div v-if="log.details" class="log-details">{{ log.details }}</div>
              </div>
            </div>
            <div v-if="taskStore.logs.length === 0" class="empty-tab">暂无日志</div>
          </template>
        </template>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.right-drawer {
  border-left: 1px solid var(--line);
  background: color-mix(in srgb, var(--panel) 98%, transparent);
  min-width: 0;
  overflow: hidden;
}

.drawer-inner {
  width: 380px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.drawer-head {
  height: 72px;
  padding: 0 20px;
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  font-weight: 600;
  font-size: 24px;
  font-family: 'Cormorant Garamond', 'EB Garamond', Georgia, serif;
  letter-spacing: -0.03em;
}

.task-summary {
  padding: 16px 20px;
  border-bottom: 1px solid var(--line);
}

.task-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--muted);
  flex-wrap: wrap;
}

.task-status {
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
}

.status-running,
.status-executing_tool {
  background: rgba(79, 70, 229, 0.15);
  color: var(--accent);
}

.status-completed {
  background: rgba(34, 197, 94, 0.15);
  color: var(--success);
}

.status-failed,
.status-interrupted {
  background: rgba(239, 68, 68, 0.15);
  color: var(--danger);
}

.status-stopped {
  background: rgba(245, 158, 11, 0.15);
  color: var(--warning);
}

.status-pending,
.status-waiting_permission {
  background: rgba(100, 116, 139, 0.15);
  color: var(--muted);
}

.drawer-tabs {
  display: flex;
  padding: 14px 14px 10px;
  gap: 6px;
  flex-wrap: wrap;
}

.drawer-tab {
  flex: 1 1 calc(50% - 6px);
  border: 0;
  background: color-mix(in srgb, var(--panel-2) 82%, transparent);
  border-radius: 999px;
  padding: 10px 8px;
  color: var(--muted);
  font-size: 12px;
  text-align: center;
  cursor: pointer;
}

.drawer-tab.active {
  background: var(--panel-3);
  color: var(--text-strong);
}

.drawer-list {
  padding: 8px 16px 18px;
  overflow: auto;
  flex: 1;
}

.empty-drawer {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: var(--muted);
  font-size: 13px;
}

.empty-tab {
  padding: 24px;
  text-align: center;
  color: var(--muted);
  font-size: 12px;
}

.step-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  border-radius: 10px;
  font-size: 13px;
}

.step-row:hover {
  background: color-mix(in srgb, var(--panel-2) 78%, transparent);
}

.step-icon {
  flex-shrink: 0;
  margin-top: 1px;
}

.step-content {
  flex: 1;
  min-width: 0;
}

.step-title {
  font-size: 13px;
  word-break: break-word;
}

.step-sub {
  display: flex;
  gap: 8px;
  margin-top: 2px;
  font-size: 11px;
  color: var(--muted);
}

.step-type {
  text-transform: uppercase;
  font-weight: 600;
}

.status-ok {
  color: var(--success);
}

.status-wait {
  color: var(--warning);
}

.status-running {
  color: var(--accent);
}

.status-fail {
  color: var(--danger);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.toolcall-row {
  padding: 14px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--panel-2) 78%, transparent);
  margin-bottom: 10px;
  border: 1px solid var(--line-soft);
}

.toolcall-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.tool-name {
  font-weight: 600;
  font-size: 13px;
  font-family: 'Consolas', monospace;
}

.tool-status {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
}

.ts-completed {
  background: rgba(34, 197, 94, 0.15);
  color: var(--success);
}

.ts-failed {
  background: rgba(239, 68, 68, 0.15);
  color: var(--danger);
}

.ts-running,
.ts-pending {
  background: rgba(79, 70, 229, 0.15);
  color: var(--accent);
}

.toolcall-details {
  margin-top: 6px;
  font-size: 11px;
}

.toolcall-details summary {
  cursor: pointer;
  color: var(--muted);
  padding: 2px 0;
}

.code-block {
  margin: 4px 0;
  padding: 10px;
  background: color-mix(in srgb, var(--panel) 88%, transparent);
  border-radius: 10px;
  font-size: 11px;
  font-family: 'Consolas', 'Monaco', monospace;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow: auto;
  color: var(--text);
}

.toolcall-error {
  margin-top: 6px;
  padding: 6px 8px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 6px;
  color: var(--danger);
  font-size: 11px;
}

.toolcall-duration {
  margin-top: 4px;
  font-size: 10px;
  color: var(--muted);
}

/* File Changes */
.change-card {
  padding: 14px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--panel-2) 78%, transparent);
  margin-bottom: 10px;
  border: 1px solid var(--line-soft);
}

.change-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  margin-bottom: 4px;
}

.change-path {
  font-family: 'Consolas', monospace;
  font-weight: 600;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.change-op {
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
}

.op-create {
  background: rgba(34, 197, 94, 0.15);
  color: var(--success);
}

.op-modify {
  background: rgba(245, 158, 11, 0.15);
  color: var(--warning);
}

.change-reverted {
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  background: rgba(100, 116, 139, 0.15);
  color: var(--muted);
}

.change-actions {
  margin-top: 8px;
}

.restore-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  color: var(--muted);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.restore-btn:hover:not(:disabled) {
  background: var(--accent-soft);
  color: var(--accent);
  border-color: var(--accent);
}

.restore-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.log-row {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 12px;
}

.log-time {
  color: var(--muted);
  font-size: 10px;
  flex-shrink: 0;
  font-family: 'Consolas', monospace;
}

.log-content {
  flex: 1;
  min-width: 0;
}

.log-message {
  word-break: break-word;
}

.log-details {
  margin-top: 2px;
  font-size: 10px;
  color: var(--muted);
  font-family: 'Consolas', monospace;
  white-space: pre-wrap;
  word-break: break-all;
}

.log-error {
  color: var(--danger);
}

.log-warn {
  color: var(--warning);
}
</style>

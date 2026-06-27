<script setup lang="ts">
import { ref, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import { useUiStore } from '@/stores/ui.store'
import { useTaskStore } from '@/stores/task.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { X, Loader2, CheckCircle2, XCircle, AlertCircle, RotateCcw, FileText } from 'lucide-vue-next'
import DiffViewer from './DiffViewer.vue'
import ArtifactCard from './ArtifactCard.vue'
import CommandOutput from './CommandOutput.vue'
import FileTree from './FileTree.vue'
import type { FileChangeInfo, ArtifactInfo, CommandSessionInfo, FileEntry } from '@/types/global'

const uiStore = useUiStore()
const taskStore = useTaskStore()
const workspaceStore = useWorkspaceStore()

const fileChanges = ref<FileChangeInfo[]>([])
const loadingChanges = ref(false)
const restoringId = ref<string | null>(null)
const artifacts = ref<ArtifactInfo[]>([])
const loadingArtifacts = ref(false)
const selectedFile = ref<FileEntry | null>(null)
const selectedFilePreview = ref('')
const selectedFileSize = ref<number | null>(null)
const selectedFileTruncated = ref(false)
const loadingFilePreview = ref(false)
const workspaceMemoryDraft = ref('')
const savingWorkspaceMemory = ref(false)
const rollingBack = ref(false)
const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
})

const drawerTabs = [
  { key: 'workspace', label: '工作区' },
  { key: 'steps', label: '步骤' },
  { key: 'files', label: '工具调用' },
  { key: 'changes', label: '文件变更' },
  { key: 'artifacts', label: '生成物' },
  { key: 'logs', label: '日志' },
] as const

// 监听当前任务变化，加载文件变更和生成物
watch(() => taskStore.currentTask?.id, async (taskId) => {
  if (taskId) {
    await Promise.all([loadFileChanges(taskId), loadArtifacts(taskId)])
  } else {
    fileChanges.value = []
    artifacts.value = []
  }
}, { immediate: true })

watch(() => workspaceStore.currentWorkspaceId, () => {
  selectedFile.value = null
  selectedFilePreview.value = ''
  selectedFileSize.value = null
  selectedFileTruncated.value = false
  workspaceMemoryDraft.value = workspaceStore.currentWorkspaceMemory
})

watch(() => workspaceStore.currentWorkspaceMemory, (value) => {
  workspaceMemoryDraft.value = value
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

async function handleFileSelect(entry: FileEntry) {
  selectedFile.value = entry
  loadingFilePreview.value = true
  selectedFilePreview.value = ''
  selectedFileSize.value = null
  selectedFileTruncated.value = false

  try {
    const result = await workspaceStore.readFile(entry.path, 0, 64 * 1024)
    if (!result) {
      selectedFilePreview.value = '无法读取该文件。'
      return
    }
    selectedFilePreview.value = result.content
    selectedFileSize.value = result.totalSize
    selectedFileTruncated.value = result.isTruncated
  } catch (err) {
    console.error('Failed to preview file:', err)
    selectedFilePreview.value = '文件预览加载失败。'
  } finally {
    loadingFilePreview.value = false
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

function stepTitle(step: { step_type: string; content: string | null }) {
  if (step.step_type === 'agent_brief') {
    if ((step.content ?? '').includes('[资料整理 Agent]') || (step.content ?? '').includes('资料整理 Agent')) return '资料整理 Agent 内部简报'
    if ((step.content ?? '').includes('[规则记忆 Agent]') || (step.content ?? '').includes('规则记忆 Agent')) return '规则记忆 Agent 内部简报'
    if ((step.content ?? '').includes('[主对话 Agent]') || (step.content ?? '').includes('主对话 Agent')) return '主对话 Agent 最终整理'
    return '协作 Agent 内部简报'
  }
  if (step.step_type === 'implementation_result') {
    return '代码实现 Agent 执行结论'
  }
  if (step.step_type === 'agent_route') {
    return '主对话 Agent 调度决策'
  }
  return step.content
}

function canExpandStep(step: { step_type: string; content: string | null }) {
  return step.step_type === 'agent_brief' || step.step_type === 'implementation_result' || (step.content?.length ?? 0) > 160
}

function renderMarkdown(content: string | null) {
  return md.render(content ?? '')
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

async function saveWorkspaceMemory() {
  if (!workspaceStore.currentWorkspaceId) return
  savingWorkspaceMemory.value = true
  try {
    await workspaceStore.saveWorkspaceMemory(workspaceMemoryDraft.value)
  } finally {
    savingWorkspaceMemory.value = false
  }
}

async function rollbackCurrentTask() {
  if (!taskStore.currentTask || rollingBack.value) return
  rollingBack.value = true
  try {
    const result = await taskStore.rollbackTask(taskStore.currentTask.id)
    alert(result.message || (result.success ? '任务已回滚' : '任务回滚失败'))
    if (result.success && taskStore.currentTask?.id) {
      await loadFileChanges(taskStore.currentTask.id)
      await workspaceStore.loadFileTree()
    }
  } finally {
    rollingBack.value = false
  }
}
</script>

<template>
  <aside class="right-drawer">
    <div class="drawer-inner">
      <div class="drawer-head">
        <div class="drawer-head-copy">
          <div class="drawer-kicker">TieX</div>
          <div class="drawer-title">任务详情</div>
        </div>
        <button class="drawer-close-btn" @click="uiStore.toggleDrawer" title="收起任务面板">
          <X :size="16" />
        </button>
      </div>

      <!-- 任务概览 -->
      <div class="task-summary drawer-card" v-if="taskStore.currentTask">
        <div class="task-title">{{ taskStore.currentTask.title || '未命名任务' }}</div>
        <div class="task-meta">
          <span class="task-status" :class="`status-${taskStore.currentTask.status}`">
            {{ taskStore.currentTask.status }}
          </span>
          <span class="meta-item">轮次: {{ taskStore.currentTask.roundCount }}</span>
          <span class="meta-item">工具: {{ taskStore.currentTask.toolCallCount }}</span>
        </div>
        <div class="task-actions">
          <button class="restore-btn" @click="rollbackCurrentTask" :disabled="rollingBack">
            <RotateCcw :size="12" />
            {{ rollingBack ? '回滚中...' : '一键回滚任务' }}
          </button>
        </div>
      </div>

      <div class="drawer-tabs">
        <button
          v-for="tab in drawerTabs"
          :key="tab.key"
          class="drawer-tab"
          :class="{ active: uiStore.activeDrawerTab === tab.key }"
          @click="uiStore.setDrawerTab(tab.key)"
        >
          {{ tab.label }}
        </button>
      </div>

      <div class="drawer-list">
        <!-- 空状态 -->
        <div v-if="!taskStore.currentTask && uiStore.activeDrawerTab !== 'workspace'" class="empty-drawer">
          <AlertCircle :size="32" />
          <div>暂无任务</div>
        </div>

        <template v-if="uiStore.activeDrawerTab === 'workspace'">
          <div v-if="!workspaceStore.hasWorkspace" class="empty-tab">当前没有已绑定的工作区</div>
          <template v-else>
            <div class="workspace-panel">
              <div class="workspace-panel-tree">
                <FileTree @select="handleFileSelect" />
              </div>
              <div class="workspace-panel-preview">
                <div class="workspace-memory-card">
                  <div class="workspace-memory-head">
                    <div class="workspace-memory-title">工作区记忆</div>
                    <button class="restore-btn" @click="saveWorkspaceMemory" :disabled="savingWorkspaceMemory">
                      {{ savingWorkspaceMemory ? '保存中...' : '保存记忆' }}
                    </button>
                  </div>
                  <textarea
                    v-model="workspaceMemoryDraft"
                    class="workspace-memory-input"
                    rows="4"
                    placeholder="记录这个工作区的构建命令、代码风格、目录习惯或注意事项。"
                  />
                </div>
                <div v-if="!selectedFile" class="empty-tab preview-empty">从左侧文件树选择一个文本文件</div>
                <template v-else>
                  <div class="preview-head">
                    <div class="preview-title">{{ selectedFile.name }}</div>
                    <div class="preview-meta">
                      <span>{{ selectedFile.path }}</span>
                      <span v-if="selectedFileSize !== null">{{ selectedFileSize }} B</span>
                      <span v-if="selectedFileTruncated">已截断</span>
                    </div>
                  </div>
                  <div v-if="loadingFilePreview" class="empty-tab preview-empty">
                    <Loader2 :size="16" class="spin inline-loader" /> 加载中...
                  </div>
                  <pre v-else class="preview-code">{{ selectedFilePreview }}</pre>
                </template>
              </div>
            </div>
          </template>
        </template>

        <template v-else-if="taskStore.currentTask">
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
                <details v-if="canExpandStep(step)" class="step-details" :open="step.step_type === 'agent_brief'">
                  <summary class="step-summary">
                    <span class="step-title">{{ stepTitle(step) }}</span>
                    <span class="step-expand-label">展开全文</span>
                  </summary>
                  <div class="step-full-content markdown-body" v-html="renderMarkdown(step.content)" />
                </details>
                <div v-else class="step-title">{{ stepTitle(step) }}</div>
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
              <Loader2 :size="16" class="spin inline-loader" /> 加载中...
            </div>
            <template v-else>
              <div
                v-for="change in fileChanges"
                :key="change.id"
                class="change-card"
              >
                <div class="change-head">
                  <FileText :size="14" class="change-file-icon" />
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
                    <RotateCcw :size="12" class="button-icon" />
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
              <Loader2 :size="16" class="spin inline-loader" /> 加载中...
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
  border-left: 1px solid var(--sidebar-border);
  background: var(--topbar-bg);
  min-width: 0;
  overflow: hidden;
}

.drawer-inner {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.drawer-head {
  height: var(--topbar-height);
  padding: 0 16px;
  border-bottom: 1px solid var(--sidebar-border);
  display: flex;
  align-items: center;
  gap: 12px;
}

.drawer-head-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.drawer-kicker {
  font-size: 10px;
  line-height: 1;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--topbar-text-soft);
  font-weight: 700;
}

.drawer-title {
  margin-top: 4px;
  font-size: 15px;
  line-height: 1.15;
  font-weight: 600;
  color: var(--topbar-text);
}

.drawer-close-btn {
  margin-left: auto;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--topbar-text-soft);
  display: grid;
  place-items: center;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
}

.drawer-close-btn:hover {
  background: color-mix(in srgb, var(--topbar-pill-bg) 94%, transparent);
  border-color: var(--sidebar-border);
  color: var(--topbar-text);
}

.drawer-card,
.workspace-panel-tree,
.workspace-panel-preview,
.toolcall-row,
.change-card {
  border: 1px solid var(--sidebar-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--sidebar-surface) 94%, transparent);
  box-shadow: var(--shadow-soft);
}

.task-summary {
  margin: 14px 14px 0;
  padding: 14px;
}

.task-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text-strong);
  line-height: 1.4;
  word-break: break-word;
}

.task-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--muted);
  flex-wrap: wrap;
}

.task-actions {
  margin-top: 12px;
}

.task-status {
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.status-running,
.status-executing_tool {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
}

.status-completed {
  background: color-mix(in srgb, var(--success) 14%, transparent);
  color: var(--success);
}

.status-failed,
.status-interrupted {
  background: color-mix(in srgb, var(--danger) 14%, transparent);
  color: var(--danger);
}

.status-stopped {
  background: color-mix(in srgb, var(--warning) 14%, transparent);
  color: var(--warning);
}

.status-pending,
.status-waiting_permission {
  background: color-mix(in srgb, var(--muted) 12%, transparent);
  color: var(--muted-soft);
}

.drawer-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding: 12px 14px 0;
  gap: 6px;
}

.drawer-tab {
  border: 0;
  background: transparent;
  border: 1px solid var(--sidebar-border);
  border-radius: 999px;
  padding: 9px 10px;
  color: var(--sidebar-text-muted);
  font-size: 12px;
  font-weight: 500;
  text-align: center;
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
}

.drawer-tab:hover {
  background: var(--sidebar-item-hover);
  color: var(--sidebar-text);
}

.drawer-tab.active {
  background: var(--sidebar-item-active);
  border-color: color-mix(in srgb, var(--sidebar-text-soft) 16%, var(--sidebar-border));
  color: var(--sidebar-text);
}

.drawer-list {
  padding: 14px;
  overflow: auto;
  flex: 1;
}

.workspace-memory-card {
  margin-bottom: 14px;
  border: 1px solid var(--sidebar-border);
  border-radius: 14px;
  padding: 12px;
  background: color-mix(in srgb, var(--sidebar-bg) 60%, var(--sidebar-surface));
}

.workspace-memory-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.workspace-memory-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-strong);
}

.workspace-memory-input {
  width: 100%;
  resize: vertical;
  min-height: 88px;
  border: 1px solid var(--sidebar-border);
  border-radius: 12px;
  background: transparent;
  color: var(--text);
  padding: 10px 12px;
  font: inherit;
  line-height: 1.6;
}

.workspace-memory-input:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--accent) 22%, var(--sidebar-border));
  box-shadow: var(--focus-ring);
}

.workspace-panel {
  display: grid;
  gap: 14px;
}

.workspace-panel-tree {
  min-height: 260px;
  overflow: hidden;
}

.workspace-panel-preview {
  display: flex;
  flex-direction: column;
  min-height: 260px;
  overflow: hidden;
}

.preview-head {
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--sidebar-border);
  background: color-mix(in srgb, var(--sidebar-bg) 50%, transparent);
}

.preview-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-strong);
}

.preview-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--muted);
  word-break: break-all;
}

.preview-code {
  margin: 0;
  padding: 16px;
  flex: 1;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.6;
  background: color-mix(in srgb, var(--sidebar-surface) 88%, transparent);
  font-family: 'Consolas', 'Monaco', monospace;
  color: var(--text);
}

.preview-empty {
  min-height: 180px;
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
  padding: 24px 18px;
  text-align: center;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}

.step-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border-radius: 14px;
  font-size: 13px;
  transition: background-color 120ms ease;
}

.step-row:hover {
  background: color-mix(in srgb, var(--sidebar-item-hover) 90%, transparent);
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

.step-details {
  min-width: 0;
}

.step-summary {
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  cursor: pointer;
}

.step-summary::-webkit-details-marker {
  display: none;
}

.step-expand-label {
  font-size: 11px;
  color: var(--muted);
  flex: 0 0 auto;
}

.step-full-content {
  margin: 8px 0 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--sidebar-bg) 60%, transparent);
  border: 1px solid var(--sidebar-border);
  font-size: 12px;
  line-height: 1.7;
  color: var(--text);
}

.step-full-content :deep(p) {
  margin: 0 0 10px;
}

.step-full-content :deep(p:last-child) {
  margin-bottom: 0;
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
  margin-bottom: 10px;
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
  padding: 3px 7px;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.ts-completed {
  background: color-mix(in srgb, var(--success) 14%, transparent);
  color: var(--success);
}

.ts-failed {
  background: color-mix(in srgb, var(--danger) 14%, transparent);
  color: var(--danger);
}

.ts-running,
.ts-pending {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
}

.toolcall-details {
  margin-top: 6px;
  font-size: 11px;
}

.toolcall-details summary {
  cursor: pointer;
  color: var(--muted);
  padding: 3px 0;
}

.code-block {
  margin: 4px 0;
  padding: 10px;
  background: color-mix(in srgb, var(--sidebar-bg) 60%, transparent);
  border: 1px solid var(--sidebar-border);
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
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  border-radius: 8px;
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
  margin-bottom: 10px;
}

.change-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  margin-bottom: 8px;
}

.change-file-icon {
  flex-shrink: 0;
  margin-top: 2px;
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
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.op-create {
  background: color-mix(in srgb, var(--success) 14%, transparent);
  color: var(--success);
}

.op-modify {
  background: color-mix(in srgb, var(--warning) 14%, transparent);
  color: var(--warning);
}

.change-reverted {
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  background: color-mix(in srgb, var(--muted) 12%, transparent);
  color: var(--muted);
}

.change-actions {
  margin-top: 8px;
}

.restore-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 10px;
  border: 1px solid var(--sidebar-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--sidebar-surface) 90%, transparent);
  color: var(--sidebar-text-soft);
  font-size: 11px;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease;
}

.restore-btn:hover:not(:disabled) {
  background: var(--sidebar-item-hover);
  color: var(--sidebar-text);
  border-color: color-mix(in srgb, var(--sidebar-text-soft) 16%, var(--sidebar-border));
}

.restore-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.button-icon,
.inline-loader {
  vertical-align: -2px;
}

.log-row {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-radius: 14px;
  font-size: 12px;
  transition: background-color 120ms ease;
}

.log-row:hover {
  background: color-mix(in srgb, var(--sidebar-item-hover) 90%, transparent);
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

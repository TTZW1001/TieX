<script setup lang="ts">
import { ref, computed } from 'vue'
import { useUiStore } from '@/stores/ui.store'
import { AlertTriangle, X, ShieldCheck, ShieldX } from 'lucide-vue-next'
import type { PermissionDecision } from '@/types/global'

const uiStore = useUiStore()
const toastMessage = ref<string | null>(null)
const isProcessing = ref(false)

const currentRequest = computed(() => uiStore.currentPermissionRequest)

const riskLevelClass = computed(() => {
  const level = currentRequest.value?.riskLevel
  if (level === 'high') return 'risk-high'
  if (level === 'medium') return 'risk-medium'
  return 'risk-low'
})

const riskLevelText = computed(() => {
  const level = currentRequest.value?.riskLevel
  if (level === 'high') return '高风险'
  if (level === 'medium') return '中风险'
  return '低风险'
})

function closeDialog() {
  if (isProcessing.value) return
  uiStore.closePermissionDialog()
}

async function makeDecision(decision: PermissionDecision) {
  if (isProcessing.value) return
  isProcessing.value = true

  try {
    const requestId = currentRequest.value?.requestId
    if (!requestId) return

    await window.tiex.permission.decide(requestId, decision)

    if (decision === 'rejected') {
      showToast('已拒绝该操作')
    } else if (decision === 'approved_for_task') {
      showToast('本次任务内已允许')
    } else {
      showToast('已允许一次并创建备份')
    }

    uiStore.closePermissionDialog()
  } catch (err: any) {
    showToast(`操作失败: ${err?.message || '未知错误'}`)
  } finally {
    isProcessing.value = false
  }
}

function deny() {
  makeDecision('rejected')
}

function allowForTask() {
  makeDecision('approved_for_task')
}

function allowOnce() {
  makeDecision('approved_once')
}

function showToast(text: string) {
  toastMessage.value = text
  setTimeout(() => {
    toastMessage.value = null
  }, 1800)
}
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop" :class="{ show: uiStore.permissionDialogOpen }" @click.self="closeDialog">
      <div class="modal">
        <div class="modal-head">
          <div class="warning-icon">
            <AlertTriangle :size="20" />
          </div>
          <div>
            <b>需要你的授权</b>
            <div class="modal-sub">{{ currentRequest?.title || 'TieX 准备修改当前工作区文件' }}</div>
          </div>
          <span class="risk-badge" :class="riskLevelClass">{{ riskLevelText }}</span>
          <button class="icon-btn" style="margin-left: 8px" @click="closeDialog" :disabled="isProcessing">
            <X :size="16" />
          </button>
        </div>
        <div class="modal-body" v-if="currentRequest">
          <div v-if="currentRequest.reason"><b>操作原因</b></div>
          <p v-if="currentRequest.reason" class="modal-desc">{{ currentRequest.reason }}</p>
          <div v-if="currentRequest.target"><b>目标文件</b></div>
          <div v-if="currentRequest.target" class="command-box">{{ currentRequest.target }}</div>
          <div v-if="currentRequest.impactSummary" class="impact">
            <AlertTriangle :size="14" style="vertical-align: -2px; margin-right: 4px" />
            {{ currentRequest.impactSummary }}
          </div>
        </div>
        <div class="modal-actions">
          <button class="secondary-btn danger-btn" @click="deny" :disabled="isProcessing">
            <ShieldX :size="14" style="vertical-align: -2px" />
            拒绝
          </button>
          <button class="secondary-btn" @click="allowForTask" :disabled="isProcessing">
            本次任务内允许
          </button>
          <button class="send-btn" @click="allowOnce" :disabled="isProcessing">
            <ShieldCheck :size="14" style="vertical-align: -2px" />
            允许一次
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Toast -->
  <Teleport to="body">
    <div class="toast" :class="{ show: toastMessage }">
      {{ toastMessage }}
    </div>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(8, 10, 14, 0.48);
  backdrop-filter: blur(6px);
  display: none;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 99;
}

.modal-backdrop.show {
  display: flex;
}

.modal {
  width: min(560px, 100%);
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 20px;
  box-shadow: var(--shadow);
  overflow: hidden;
}

.modal-head {
  padding: 18px 20px;
  border-bottom: 1px solid var(--line);
  display: flex;
  gap: 12px;
  align-items: center;
}

.warning-icon {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: var(--warning-soft);
  color: var(--warning-strong);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.risk-badge {
  margin-left: auto;
  padding: 3px 10px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
}

.risk-high {
  background: var(--danger-soft);
  color: var(--danger-strong);
}

.risk-medium {
  background: var(--warning-soft);
  color: var(--warning-strong);
}

.risk-low {
  background: var(--success-soft);
  color: var(--success-strong);
}

.modal-sub {
  color: var(--muted);
  font-size: 12px;
  margin-top: 4px;
}

.modal-body {
  padding: 20px;
}

.modal-desc {
  color: var(--muted);
  font-size: 13px;
  margin: 4px 0 12px;
}

.command-box {
  margin-top: 12px;
  background: var(--code-bg);
  color: var(--code-text);
  border-radius: 12px;
  padding: 13px;
  font-family: Consolas, monospace;
  font-size: 13px;
  border: 1px solid var(--code-border);
}

.impact {
  margin-top: 14px;
  padding: 12px;
  border-radius: 12px;
  background: var(--panel-2);
  color: var(--muted);
  font-size: 13px;
}

.modal-actions {
  display: flex;
  gap: 9px;
  justify-content: flex-end;
  padding: 16px 20px;
  border-top: 1px solid var(--line);
}

.danger-btn {
  color: var(--danger-strong) !important;
}

.danger-btn:hover {
  background: var(--danger-soft) !important;
}

.toast {
  position: fixed;
  right: 20px;
  bottom: 20px;
  background: var(--text);
  color: var(--panel);
  padding: 12px 16px;
  border-radius: 12px;
  opacity: 0;
  transform: translateY(10px);
  pointer-events: none;
  transition: all 0.2s;
  z-index: 120;
  font-size: 13px;
}

.toast.show {
  opacity: 1;
  transform: translateY(0);
}
</style>

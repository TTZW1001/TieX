<script setup lang="ts">
import { computed, ref } from 'vue'
import { AlertTriangle, ShieldCheck, ShieldOff, Wrench } from 'lucide-vue-next'
import { useUiStore, type PermissionRequestData } from '@/stores/ui.store'
import type { PermissionDecision } from '@/types/global'
import {
  buildPermissionFields,
  getApprovalScopeText,
  getManualPlanDraft,
  getPermissionRiskClass,
  getPermissionRiskText,
} from '@/utils/permission-display'

const props = defineProps<{
  request: PermissionRequestData
}>()

const uiStore = useUiStore()
const isProcessing = ref(false)
const rejectionReason = ref('')

const riskText = computed(() => {
  return getPermissionRiskText(props.request.riskLevel)
})

const riskClass = computed(() => getPermissionRiskClass(props.request.riskLevel))

const permissionFields = computed(() => {
  return buildPermissionFields({
    reason: props.request.reason,
    target: props.request.target,
    impactSummary: props.request.impactSummary,
    permissionType: props.request.toolName,
  })
})

async function submitDecision(decision: PermissionDecision, decisionReason?: string | null) {
  if (isProcessing.value) return
  isProcessing.value = true
  try {
    await window.tiex.permission.decide(props.request.requestId, decision, decisionReason)
    uiStore.closePermissionDialog()
  } finally {
    isProcessing.value = false
  }
}

async function handleManualPlan() {
  uiStore.setComposerDraft(getManualPlanDraft({
    reason: props.request.reason,
    target: props.request.target,
    impactSummary: props.request.impactSummary,
    userReason: rejectionReason.value,
  }), 'manual_plan')
  await submitDecision('rejected', rejectionReason.value)
}

async function handleReject() {
  if (rejectionReason.value.trim()) {
    uiStore.setComposerDraft(getManualPlanDraft({
      reason: props.request.reason,
      target: props.request.target,
      impactSummary: props.request.impactSummary,
      userReason: rejectionReason.value,
    }), 'permission_rejection')
  }
  await submitDecision('rejected', rejectionReason.value)
}
</script>

<template>
  <div class="approval-shell">
    <div class="approval-avatar">
      <AlertTriangle :size="16" />
    </div>
    <div class="approval-card">
      <div class="approval-head">
        <div>
          <div class="approval-author">TieX 需要确认</div>
          <div class="approval-title">{{ request.title }}</div>
        </div>
        <span class="approval-risk" :class="riskClass">{{ riskText }}</span>
      </div>

      <div v-if="permissionFields.length" class="approval-facts">
        <div v-for="field in permissionFields" :key="field.label" class="approval-fact">
          <span>{{ field.label }}</span>
          <b>{{ field.value }}</b>
        </div>
      </div>

      <div class="approval-scope-grid">
        <div class="approval-scope">
          <span>允许一次</span>
          <p>{{ getApprovalScopeText('once') }}</p>
        </div>
        <div class="approval-scope">
          <span>本次会话内允许</span>
          <p>{{ getApprovalScopeText('conversation') }}</p>
        </div>
      </div>

      <label class="approval-rejection">
        <span>拒绝说明（可选）</span>
        <textarea
          v-model="rejectionReason"
          rows="2"
          placeholder="例如：先不要改这个文件、命令风险太高、我想手动处理这一步。"
        />
      </label>

      <div class="approval-actions">
        <button class="secondary-btn" :disabled="isProcessing" @click="submitDecision('approved_once')">
          <ShieldCheck :size="14" />
          允许一次
        </button>
        <button class="secondary-btn" :disabled="isProcessing" @click="submitDecision('approved_for_conversation')">
          本次会话内允许
        </button>
        <button class="secondary-btn" :disabled="isProcessing" @click="handleManualPlan">
          <Wrench :size="14" />
          我来手动处理
        </button>
        <button class="danger-btn approval-deny" :disabled="isProcessing" @click="handleReject">
          <ShieldOff :size="14" />
          拒绝
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.approval-shell {
  display: flex;
  gap: 16px;
  margin: 6px 0 26px;
  align-items: flex-start;
}

.approval-avatar {
  width: 38px;
  height: 38px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--warning) 22%, var(--panel));
  color: var(--warning-strong);
  display: grid;
  place-items: center;
  box-shadow: var(--shadow-soft);
  flex: 0 0 auto;
}

.approval-card {
  max-width: 800px;
  width: 100%;
  padding: 18px 18px 16px;
  border-radius: 20px;
  border: 1px solid color-mix(in srgb, var(--warning) 24%, var(--line));
  background: color-mix(in srgb, var(--panel) 94%, transparent);
  box-shadow: var(--shadow-soft);
}

.approval-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.approval-author {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted-soft);
}

.approval-title {
  margin-top: 6px;
  font-size: 16px;
  color: var(--text-strong);
  font-weight: 600;
}

.approval-risk {
  margin-left: auto;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  border: 1px solid var(--line);
  white-space: nowrap;
}

.approval-risk.high {
  color: var(--danger-strong);
  background: var(--danger-soft);
}

.approval-risk.medium {
  color: var(--warning-strong);
  background: var(--warning-soft);
}

.approval-risk.low {
  color: var(--success-strong);
  background: var(--success-soft);
}

.approval-risk.blocked {
  color: var(--danger-strong);
  background: var(--danger-soft);
}

.approval-facts {
  display: grid;
  gap: 8px;
  margin-top: 14px;
}

.approval-fact {
  display: grid;
  grid-template-columns: 68px minmax(0, 1fr);
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--panel-2) 88%, transparent);
  border: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
}

.approval-fact span {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.approval-fact b {
  color: var(--text-strong);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.55;
  word-break: break-word;
}

.approval-scope-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.approval-scope {
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--warning) 7%, transparent);
  border: 1px solid color-mix(in srgb, var(--warning) 16%, var(--line));
}

.approval-scope span {
  color: var(--text-strong);
  font-size: 12px;
  font-weight: 700;
}

.approval-scope p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
}

.approval-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.approval-rejection {
  display: grid;
  gap: 7px;
  margin-top: 12px;
}

.approval-rejection span {
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
}

.approval-rejection textarea {
  width: 100%;
  resize: vertical;
  min-height: 58px;
  border: 1px solid color-mix(in srgb, var(--line) 76%, transparent);
  border-radius: 12px;
  padding: 9px 11px;
  background: color-mix(in srgb, var(--panel-2) 78%, transparent);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  outline: none;
}

.approval-rejection textarea:focus {
  border-color: color-mix(in srgb, var(--accent) 28%, var(--line));
  background: color-mix(in srgb, var(--panel-2) 92%, transparent);
}

.approval-actions button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.approval-deny {
  padding-inline: 14px;
}

@media (max-width: 720px) {
  .approval-scope-grid {
    grid-template-columns: 1fr;
  }
}
</style>

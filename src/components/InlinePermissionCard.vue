<script setup lang="ts">
import { computed, ref } from 'vue'
import { AlertTriangle, ShieldCheck, ShieldOff, Wrench } from 'lucide-vue-next'
import { useUiStore, type PermissionRequestData } from '@/stores/ui.store'
import type { PermissionDecision } from '@/types/global'

const props = defineProps<{
  request: PermissionRequestData
}>()

const uiStore = useUiStore()
const isProcessing = ref(false)

const riskText = computed(() => {
  if (props.request.riskLevel === 'high') return '高风险'
  if (props.request.riskLevel === 'medium') return '中风险'
  return '低风险'
})

const requestSummary = computed(() => {
  const detailParts = [props.request.reason, props.request.target].filter(Boolean)
  return detailParts.join(' · ')
})

async function submitDecision(decision: PermissionDecision) {
  if (isProcessing.value) return
  isProcessing.value = true
  try {
    await window.tiex.permission.decide(props.request.requestId, decision)
    uiStore.closePermissionDialog()
  } finally {
    isProcessing.value = false
  }
}

async function handleManualPlan() {
  const target = props.request.target ? `\n目标：${props.request.target}` : ''
  const reason = props.request.reason ? `\n原因：${props.request.reason}` : ''
  uiStore.setComposerDraft(`不要直接执行这个操作，我会手动处理。请改为给我一个更安全的人工处理方案和逐步说明。${target}${reason}`)
  await submitDecision('rejected')
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
        <span class="approval-risk" :class="request.riskLevel">{{ riskText }}</span>
      </div>

      <p v-if="requestSummary" class="approval-summary">{{ requestSummary }}</p>
      <div v-if="request.impactSummary" class="approval-impact">{{ request.impactSummary }}</div>

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
        <button class="danger-btn approval-deny" :disabled="isProcessing" @click="submitDecision('rejected')">
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

.approval-summary {
  margin: 12px 0 0;
  color: var(--body);
  line-height: 1.7;
  font-size: 14px;
}

.approval-impact {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--panel-2) 92%, transparent);
  color: var(--text-strong);
  font-size: 13px;
  line-height: 1.6;
}

.approval-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.approval-actions button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.approval-deny {
  padding-inline: 14px;
}
</style>

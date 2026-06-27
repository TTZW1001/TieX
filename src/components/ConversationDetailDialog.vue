<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { useUiStore } from '@/stores/ui.store'
import { useConversationStore } from '@/stores/conversation.store'
import type { ConversationDetailStatsInfo } from '@/types/global'
import UsageDonutChart from '@/components/UsageDonutChart.vue'
import TokenSeriesChart from '@/components/TokenSeriesChart.vue'

const uiStore = useUiStore()
const conversationStore = useConversationStore()

const detail = ref<ConversationDetailStatsInfo | null>(null)
const loading = ref(false)
const range = ref<'hour' | 'day' | 'week' | 'month'>('day')

const conversationId = computed(() => uiStore.conversationDetailId)
const dialogOpen = computed(() => uiStore.conversationDetailOpen && !!conversationId.value)
const activeSeries = computed(() => detail.value?.token_series[range.value] ?? [])
const conversationTitle = computed(() => {
  const currentId = conversationId.value
  if (!currentId) return '会话详情'
  return conversationStore.conversations.find((item) => item.id === currentId)?.title ?? '会话详情'
})

function formatDateTime(value: string | null): string {
  if (!value) return '暂无'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

async function loadDetail() {
  if (!dialogOpen.value || !conversationId.value || !window.tiex?.stats) {
    detail.value = null
    return
  }

  loading.value = true
  try {
    detail.value = await window.tiex.stats.getConversationDetail(conversationId.value)
  } finally {
    loading.value = false
  }
}

function closeDialog() {
  uiStore.closeConversationDetail()
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && dialogOpen.value) {
    closeDialog()
  }
}

watch([dialogOpen, conversationId], () => {
  if (dialogOpen.value) {
    loadDetail()
    return
  }
  detail.value = null
}, { immediate: true })

watch(dialogOpen, (open) => {
  if (open) {
    window.addEventListener('keydown', handleKeydown)
    return
  }
  window.removeEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Transition name="detail-fade">
    <div v-if="dialogOpen" class="detail-mask" @click.self="closeDialog">
      <div class="detail-dialog" role="dialog" aria-modal="true" :aria-label="`${conversationTitle} 详细信息`">
        <button class="detail-close" @click="closeDialog" aria-label="关闭会话详情">
          <X :size="16" />
        </button>

        <div class="detail-scroll">
          <div class="detail-hero">
            <div class="detail-kicker">TieX</div>
            <h2>{{ detail?.title || conversationTitle }}</h2>
            <p class="detail-copy">
              <template v-if="detail">
                {{ detail.workspace_name || '未绑定工作区' }} · {{ detail.message_count }} 条消息 · {{ detail.task_count }} 个任务
              </template>
              <template v-else>
                {{ loading ? '正在整理会话详情…' : '暂时没有可展示的详细信息。' }}
              </template>
            </p>
          </div>

          <template v-if="detail">
            <div class="metric-grid">
              <div class="metric-card">
                <div class="metric-label">累计 Token</div>
                <div class="metric-value">{{ detail.total_tokens }}</div>
              </div>
              <div class="metric-card">
                <div class="metric-label">首条消息</div>
                <div class="metric-value small">{{ formatDateTime(detail.first_message_at) }}</div>
              </div>
              <div class="metric-card">
                <div class="metric-label">最近活动</div>
                <div class="metric-value small">{{ formatDateTime(detail.last_message_at) }}</div>
              </div>
            </div>

            <div class="detail-section">
              <div class="section-head">
                <div>
                  <h3>会话摘要记忆</h3>
                  <p class="section-copy">这是 TieX 自动归纳出的当前会话上下文摘要，会参与后续推理。</p>
                </div>
              </div>
              <div class="summary-box">{{ detail.summary || '当前还没有生成摘要，继续对话后会逐步形成。' }}</div>
            </div>

            <div class="detail-section">
              <div class="section-head">
                <div>
                  <h3>模型使用占比</h3>
                  <p class="section-copy">按当前会话已产生的 assistant token 统计。</p>
                </div>
              </div>
              <UsageDonutChart :items="detail.model_usage" />
            </div>

            <div class="detail-section">
              <div class="section-head token-head">
                <div>
                  <h3>Token 曲线</h3>
                  <p class="section-copy">按时间粒度查看当前会话的 token 消耗。</p>
                </div>
                <div class="range-switch">
                  <button
                    v-for="item in ['hour', 'day', 'week', 'month']"
                    :key="item"
                    class="range-btn"
                    :class="{ active: range === item }"
                    @click="range = item as any"
                  >
                    {{ item }}
                  </button>
                </div>
              </div>
              <TokenSeriesChart :points="activeSeries" :label="`按 ${range} 统计`" />
            </div>
          </template>

          <div v-else class="detail-empty">
            {{ loading ? '加载中...' : '没有找到这个会话的详细信息。' }}
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.detail-mask {
  position: fixed;
  inset: 0;
  z-index: 8000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: color-mix(in srgb, #06070a 58%, transparent);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.detail-dialog {
  position: relative;
  width: min(720px, calc(100vw - 72px));
  max-height: min(760px, calc(100vh - 64px));
  border-radius: 22px;
  border: 1px solid color-mix(in srgb, var(--line) 88%, rgba(255, 255, 255, 0.08));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--topbar-bg) 24%, transparent), transparent 132px),
    color-mix(in srgb, var(--panel) 96%, var(--bg));
  box-shadow:
    0 24px 72px rgba(0, 0, 0, 0.28),
    inset 0 1px 0 color-mix(in srgb, white 6%, transparent);
  overflow: hidden;
}

.detail-close {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 2;
  width: 32px;
  height: 32px;
  border-radius: 11px;
  border: 1px solid color-mix(in srgb, var(--line) 84%, transparent);
  color: var(--text-strong);
  background: color-mix(in srgb, var(--panel-2) 92%, transparent);
  display: grid;
  place-items: center;
  transition: background-color 120ms ease, border-color 120ms ease, transform 120ms ease;
}

.detail-close:hover {
  background: var(--sidebar-item-hover);
  border-color: color-mix(in srgb, var(--sidebar-text-soft) 18%, var(--sidebar-border));
  transform: translateY(-1px);
}

.detail-scroll {
  max-height: inherit;
  overflow-y: auto;
  padding: 26px 24px 24px;
}

.detail-hero {
  padding-right: 42px;
  margin-bottom: 18px;
}

.detail-kicker {
  margin-bottom: 6px;
  color: var(--topbar-text-soft);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.detail-hero h2 {
  margin: 0;
  color: var(--text-strong);
  font-size: clamp(22px, 3vw, 34px);
  font-weight: 600;
  letter-spacing: -0.04em;
  line-height: 1.08;
}

.detail-copy,
.section-copy {
  margin-top: 10px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.7;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.metric-card,
.detail-section {
  border: 1px solid color-mix(in srgb, var(--line) 84%, rgba(255, 255, 255, 0.08));
  border-radius: 18px;
  background: color-mix(in srgb, var(--panel-2) 68%, var(--panel));
  box-shadow: inset 0 1px 0 color-mix(in srgb, white 4%, transparent);
}

.metric-card {
  padding: 14px 15px 15px;
}

.metric-label {
  color: var(--muted-soft);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.metric-value {
  margin-top: 8px;
  color: var(--text-strong);
  font-size: 24px;
  font-weight: 600;
  line-height: 1.15;
}

.metric-value.small {
  font-size: 14px;
  line-height: 1.7;
  word-break: break-word;
}

.detail-section {
  padding: 16px;
  margin-top: 12px;
}

.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.section-head h3 {
  margin: 0;
  color: var(--text-strong);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.summary-box {
  border: 1px solid color-mix(in srgb, var(--line) 78%, transparent);
  border-radius: 14px;
  padding: 14px 15px;
  background: color-mix(in srgb, var(--panel-3) 56%, var(--panel));
  color: var(--text);
  font-size: 13px;
  line-height: 1.75;
  white-space: pre-wrap;
}

.token-head {
  align-items: center;
}

.range-switch {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.range-btn {
  min-height: 28px;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--line) 82%, transparent);
  background: transparent;
  color: var(--muted-soft);
  font-size: 11px;
  text-transform: uppercase;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
}

.range-btn:hover {
  background: var(--sidebar-item-hover);
  color: var(--text-strong);
}

.range-btn.active {
  border-color: color-mix(in srgb, var(--accent) 24%, var(--sidebar-border));
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
}

.detail-empty {
  min-height: 240px;
  display: grid;
  place-items: center;
  color: var(--muted);
  font-size: 14px;
}

.detail-fade-enter-active,
.detail-fade-leave-active {
  transition: opacity 180ms ease;
}

.detail-fade-enter-active .detail-dialog,
.detail-fade-leave-active .detail-dialog {
  transition: opacity 180ms ease, transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

.detail-fade-enter-from,
.detail-fade-leave-to {
  opacity: 0;
}

.detail-fade-enter-from .detail-dialog,
.detail-fade-leave-to .detail-dialog {
  opacity: 0;
  transform: scale(0.97) translateY(10px);
}

@media (max-width: 900px) {
  .detail-mask {
    padding: 16px;
  }

  .detail-dialog {
    width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
    border-radius: 18px;
  }

  .detail-scroll {
    padding: 22px 16px 18px;
  }

  .metric-grid {
    grid-template-columns: 1fr;
  }

  .token-head,
  .section-head {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>

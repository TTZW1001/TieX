<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { ConversationDetailStatsInfo } from '@/types/global'
import UsageDonutChart from '@/components/UsageDonutChart.vue'
import TokenSeriesChart from '@/components/TokenSeriesChart.vue'

const route = useRoute()
const detail = ref<ConversationDetailStatsInfo | null>(null)
const loading = ref(false)
const range = ref<'hour' | 'day' | 'week' | 'month'>('day')

const activeSeries = computed(() => detail.value?.token_series[range.value] ?? [])

async function loadDetail() {
  const conversationId = String(route.params.id ?? '')
  if (!conversationId || !window.tiex?.stats) return
  loading.value = true
  try {
    detail.value = await window.tiex.stats.getConversationDetail(conversationId)
  } finally {
    loading.value = false
  }
}

watch(() => route.params.id, () => {
  loadDetail()
}, { immediate: true })

onMounted(() => {
  loadDetail()
})
</script>

<template>
  <div class="detail-page">
    <div class="detail-wrap" v-if="detail">
      <div class="detail-hero">
        <div class="detail-kicker">Conversation Detail</div>
        <h2 class="display-serif">{{ detail.title }}</h2>
        <p class="detail-copy">
          {{ detail.workspace_name || '未绑定工作区' }} · {{ detail.message_count }} 条消息 · {{ detail.task_count }} 个任务
        </p>
      </div>

      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">累计 Token</div>
          <div class="metric-value">{{ detail.total_tokens }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">首条消息</div>
          <div class="metric-value small">{{ detail.first_message_at || '暂无' }}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">最近活动</div>
          <div class="metric-value small">{{ detail.last_message_at || '暂无' }}</div>
        </div>
      </div>

      <div class="detail-card">
        <div class="card-head">
          <div>
            <h3 class="display-serif">会话摘要记忆</h3>
            <p class="card-copy">这是 TieX 自动归纳出的当前会话上下文摘要，会参与后续推理。</p>
          </div>
        </div>
        <div class="summary-box">{{ detail.summary || '当前还没有生成摘要，继续对话后会逐步形成。' }}</div>
      </div>

      <div class="detail-card">
        <div class="card-head">
          <div>
            <h3 class="display-serif">模型使用占比</h3>
            <p class="card-copy">按这个会话已产生的 assistant token 统计。</p>
          </div>
        </div>
        <UsageDonutChart :items="detail.model_usage" />
      </div>

      <div class="detail-card">
        <div class="card-head">
          <div>
            <h3 class="display-serif">Token 曲线</h3>
            <p class="card-copy">按时间粒度查看当前会话的 token 消耗。</p>
          </div>
          <div class="range-switch">
            <button v-for="item in ['hour', 'day', 'week', 'month']" :key="item" class="range-btn" :class="{ active: range === item }" @click="range = item as any">
              {{ item }}
            </button>
          </div>
        </div>
        <TokenSeriesChart :points="activeSeries" :label="`按 ${range} 统计`" />
      </div>
    </div>

    <div v-else class="detail-empty">
      {{ loading ? '加载中...' : '没有找到这个会话的详细信息。' }}
    </div>
  </div>
</template>

<style scoped>
.detail-page {
  height: 100%;
  overflow: auto;
  padding: 40px 36px 56px;
}

.detail-wrap {
  width: min(980px, 100%);
  margin: 0 auto;
}

.detail-hero {
  margin-bottom: 24px;
}

.detail-kicker {
  font-size: 12px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted-soft);
  margin-bottom: 10px;
}

.detail-copy,
.card-copy {
  color: var(--muted);
  line-height: 1.7;
  font-size: 13px;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}

.metric-card,
.detail-card {
  border: 1px solid var(--line);
  border-radius: 24px;
  background: color-mix(in srgb, var(--panel) 94%, transparent);
  box-shadow: var(--shadow-soft);
}

.metric-card {
  padding: 18px;
}

.metric-label {
  color: var(--muted-soft);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.metric-value {
  margin-top: 10px;
  font-size: 32px;
  font-weight: 600;
  color: var(--text-strong);
}

.metric-value.small {
  font-size: 14px;
  line-height: 1.7;
  word-break: break-all;
}

.detail-card {
  padding: 22px;
  margin-bottom: 18px;
}

.card-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
  align-items: flex-start;
}

.summary-box {
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 16px;
  background: color-mix(in srgb, var(--panel) 92%, transparent);
  line-height: 1.8;
  white-space: pre-wrap;
}

.range-switch {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.range-btn {
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  padding: 8px 12px;
  text-transform: uppercase;
  font-size: 11px;
}

.range-btn.active {
  background: var(--accent-soft);
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 36%, var(--line));
}

.detail-empty {
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--muted);
}

@media (max-width: 900px) {
  .detail-page {
    padding: 28px 18px 36px;
  }

  .metric-grid {
    grid-template-columns: 1fr;
  }

  .card-head {
    flex-direction: column;
  }
}
</style>

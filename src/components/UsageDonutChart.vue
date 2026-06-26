<script setup lang="ts">
import { computed } from 'vue'
import type { ModelUsageShareInfo } from '@/types/global'

const props = defineProps<{
  items: ModelUsageShareInfo[]
}>()

const palette = ['#d97757', '#4f8f73', '#4a6fa5', '#b286fd', '#d4a017', '#9c6644']

const chartSegments = computed(() => {
  let offset = 0
  return props.items.map((item, index) => {
    const value = Math.max(0, item.percentage)
    const segment = {
      ...item,
      color: palette[index % palette.length],
      dasharray: `${value} ${100 - value}`,
      dashoffset: -offset,
    }
    offset += value
    return segment
  })
})
</script>

<template>
  <div class="usage-chart">
    <svg viewBox="0 0 42 42" class="donut" aria-hidden="true">
      <circle class="ring" cx="21" cy="21" r="15.9155" />
      <circle
        v-for="item in chartSegments"
        :key="`${item.provider_id}-${item.model_name}`"
        class="segment"
        cx="21"
        cy="21"
        r="15.9155"
        :stroke="item.color"
        :stroke-dasharray="item.dasharray"
        :stroke-dashoffset="item.dashoffset"
      />
    </svg>
    <div class="usage-legend">
      <div v-for="item in chartSegments" :key="item.model_name" class="legend-row">
        <span class="legend-dot" :style="{ background: item.color }" />
        <span class="legend-label">{{ item.provider_name }} · {{ item.model_name }}</span>
        <span class="legend-value">{{ item.percentage }}%</span>
      </div>
      <div v-if="chartSegments.length === 0" class="legend-empty">还没有可统计的模型使用数据</div>
    </div>
  </div>
</template>

<style scoped>
.usage-chart {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 18px;
  align-items: center;
}

.donut {
  width: 180px;
  height: 180px;
}

.ring,
.segment {
  fill: transparent;
  stroke-width: 3.6;
}

.ring {
  stroke: color-mix(in srgb, var(--line) 88%, transparent);
}

.segment {
  stroke-linecap: butt;
  transform: rotate(-90deg);
  transform-origin: 50% 50%;
}

.usage-legend {
  display: grid;
  gap: 10px;
}

.legend-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
  font-size: 13px;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
}

.legend-label {
  color: var(--text-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.legend-value,
.legend-empty {
  color: var(--muted);
}

@media (max-width: 900px) {
  .usage-chart {
    grid-template-columns: 1fr;
  }
}
</style>

<script setup lang="ts">
import { computed } from 'vue'
import type { TokenPointInfo } from '@/types/global'

const props = defineProps<{
  points: TokenPointInfo[]
  label?: string
}>()

const width = 560
const height = 220
const padding = 28

const normalized = computed(() => {
  if (props.points.length === 0) return []
  const maxValue = Math.max(...props.points.map((point) => point.tokens), 1)
  const span = Math.max(props.points.length - 1, 1)
  return props.points.map((point, index) => {
    const x = padding + ((width - padding * 2) * index) / span
    const y = height - padding - ((height - padding * 2) * point.tokens) / maxValue
    return { ...point, x, y }
  })
})

const pathD = computed(() => {
  if (normalized.value.length === 0) return ''
  return normalized.value.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
})
</script>

<template>
  <div class="series-card">
    <div class="series-head">
      <div class="series-label">{{ label || 'Token 曲线' }}</div>
    </div>
    <div v-if="normalized.length === 0" class="series-empty">还没有可展示的 token 数据</div>
    <svg v-else :viewBox="`0 0 ${width} ${height}`" class="series-svg" preserveAspectRatio="none">
      <path class="series-grid" :d="`M ${padding} ${height - padding} L ${width - padding} ${height - padding}`" />
      <path class="series-line" :d="pathD" />
      <circle
        v-for="point in normalized"
        :key="point.bucket"
        class="series-dot"
        :cx="point.x"
        :cy="point.y"
        r="3"
      />
    </svg>
    <div v-if="normalized.length > 0" class="series-axis">
      <span>{{ normalized[0]?.bucket }}</span>
      <span>{{ normalized[normalized.length - 1]?.bucket }}</span>
    </div>
  </div>
</template>

<style scoped>
.series-card {
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 16px;
  background: color-mix(in srgb, var(--panel) 92%, transparent);
}

.series-head {
  margin-bottom: 12px;
}

.series-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-strong);
}

.series-svg {
  width: 100%;
  height: 220px;
}

.series-grid {
  stroke: color-mix(in srgb, var(--line) 90%, transparent);
  stroke-width: 1;
  fill: none;
}

.series-line {
  stroke: var(--accent);
  stroke-width: 2.5;
  fill: none;
}

.series-dot {
  fill: var(--accent);
}

.series-axis {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--muted);
  font-size: 11px;
}

.series-empty {
  color: var(--muted);
  font-size: 13px;
  min-height: 220px;
  display: grid;
  place-items: center;
}
</style>

<script setup lang="ts">
import { computed } from 'vue'
import { ChevronRight, Loader2 } from 'lucide-vue-next'
import ActivityFeedItem, { type ActivityEntry } from './ActivityFeedItem.vue'
import MarkdownContent from './MarkdownContent.vue'

export type ProcessStreamItem =
  | {
      id: string
      kind: 'note'
      createdAt: string
      content: string
      streaming?: boolean
    }
  | {
      id: string
      kind: 'activity'
      createdAt: string
      entry: ActivityEntry
    }

const props = defineProps<{
  items: ProcessStreamItem[]
  running: boolean
}>()

const summaryLabel = computed(() => {
  return props.running ? '处理中' : '已处理'
})

const summaryCount = computed(() => `${props.items.length} 项`)
</script>

<template>
  <details class="process-block" :open="running">
    <summary class="process-summary">
      <div class="process-main">
        <Loader2 v-if="running" :size="14" class="process-icon spin" />
        <span v-else class="process-icon static-dot" />
        <span class="process-label">{{ summaryLabel }}</span>
        <span class="process-count">{{ summaryCount }}</span>
      </div>
      <ChevronRight :size="15" class="process-caret" />
    </summary>

    <div class="process-stream">
      <template v-for="(item, index) in items" :key="item.id">
        <div v-if="item.kind === 'note'" class="process-note">
          <MarkdownContent class="process-note-body" :content="item.content" />
        </div>
        <ActivityFeedItem
          v-else
          :entry="item.entry"
          :class="{ 'last-activity': index === items.length - 1 }"
        />
      </template>
    </div>
  </details>
</template>

<style scoped>
.process-block {
  min-width: 0;
}

.process-summary {
  list-style: none;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: var(--muted);
}

.process-summary::-webkit-details-marker {
  display: none;
}

.process-main {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.process-icon {
  color: var(--muted-soft);
}

.static-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted) 40%, transparent);
  display: inline-block;
}

.process-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-strong);
}

.process-count {
  font-size: 13px;
  color: var(--muted);
}

.process-caret {
  color: var(--muted-soft);
  transition: transform var(--duration-fast) var(--ease-out);
}

details[open] > .process-summary .process-caret {
  transform: rotate(90deg);
}

.process-stream {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.process-note {
  padding-left: 36px;
}

.process-note-body {
  color: var(--text);
  font-size: 15px;
  line-height: 1.8;
}

.process-note-body :deep(p) {
  margin: 0 0 10px;
}

.process-note-body :deep(p:last-child) {
  margin-bottom: 0;
}

.spin {
  animation: processSpin 1s linear infinite;
}

@keyframes processSpin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>

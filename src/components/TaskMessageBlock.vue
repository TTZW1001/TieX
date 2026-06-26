<script setup lang="ts">
import { computed } from 'vue'
import MarkdownIt from 'markdown-it'
import type { ChatMessage } from '@/stores/chat.store'
import ActivityProcessBlock, { type ProcessStreamItem } from './ActivityProcessBlock.vue'

const appIconUrl = new URL('../../icon.png', import.meta.url).href

const props = defineProps<{
  summaryMessage: ChatMessage | null
  processItems: ProcessStreamItem[]
  running: boolean
}>()

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
})

const hasProcess = computed(() => props.processItems.length > 0)
const renderedSummary = computed(() => {
  if (!props.summaryMessage?.content) return ''
  return md.render(props.summaryMessage.content)
})
</script>

<template>
  <div class="message task-message">
    <div class="avatar ai">
      <img :src="appIconUrl" alt="TieX logo" />
    </div>

    <div class="bubble">
      <div class="author-row">
        <div class="author">TieX</div>
      </div>

      <ActivityProcessBlock
        v-if="hasProcess"
        :items="processItems"
        :running="running"
      />

      <div
        v-if="summaryMessage?.content"
        class="bubble-content markdown-body final-summary"
        v-html="renderedSummary"
      />
    </div>
  </div>
</template>

<style scoped>
.message {
  display: flex;
  gap: 16px;
  margin-bottom: 34px;
  align-items: flex-start;
}

.avatar {
  width: 38px;
  height: 38px;
  border-radius: 14px;
  background: #faf6ed;
  color: #1d1b19;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  box-shadow: var(--shadow-soft);
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.bubble {
  min-width: 0;
  max-width: 800px;
}

.author-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.author {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--muted-soft);
}

.final-summary {
  margin-top: 14px;
  line-height: 1.75;
  font-size: 16px;
}

.final-summary:first-child {
  margin-top: 0;
}
</style>

<script setup lang="ts">
import { computed } from 'vue'
import type { ChatMessage } from '@/stores/chat.store'
import ActivityProcessBlock, { type ProcessStreamItem } from './ActivityProcessBlock.vue'
import MarkdownContent from './MarkdownContent.vue'

const appIconUrl = new URL('../../icon.png', import.meta.url).href

const props = defineProps<{
  taskId: string
  summaryMessage: ChatMessage | null
  processItems: ProcessStreamItem[]
  running: boolean
  taskTitle?: string | null
  agentBadges?: Array<{
    id: string
    label: string
    status: 'running' | 'completed' | 'failed'
  }>
}>()

const emit = defineEmits<{
  (e: 'inspect', taskId: string): void
}>()

const hasProcess = computed(() => props.processItems.length > 0)
</script>

<template>
  <div class="message task-message">
    <div class="avatar ai">
      <img :src="appIconUrl" alt="TieX logo" />
    </div>

    <div class="bubble">
      <div class="author-row">
        <div class="author-group">
          <div class="author">TieX</div>
          <div class="author-subtitle">主对话 Agent 最终回复</div>
        </div>
        <div v-if="agentBadges?.length" class="agent-badge-row">
          <span
            v-for="badge in agentBadges"
            :key="badge.id"
            class="agent-badge"
            :class="`status-${badge.status}`"
          >
            {{ badge.label }}
          </span>
        </div>
      </div>

      <ActivityProcessBlock
        v-if="hasProcess"
        :items="processItems"
        :running="running"
      />

      <MarkdownContent
        v-if="summaryMessage?.content"
        class="bubble-content final-summary"
        :content="summaryMessage.content"
      />

      <div class="message-actions">
        <button class="inspect-btn" type="button" @click="emit('inspect', taskId)">
          查看任务详情
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.message {
  display: flex;
  gap: 16px;
  margin-bottom: 28px;
  align-items: flex-start;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: #faf6ed;
  color: #1d1b19;
  overflow: hidden;
  border: 1px solid var(--sidebar-border);
  display: grid;
  place-items: center;
  flex: 0 0 auto;
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.bubble {
  min-width: 0;
  max-width: 780px;
}

.author-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.author-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.author {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: var(--sidebar-text-muted);
}

.author-subtitle {
  font-size: 12px;
  color: var(--sidebar-text-muted);
}

.agent-badge-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.agent-badge {
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 11px;
  border: 1px solid var(--sidebar-border);
  background: color-mix(in srgb, var(--sidebar-surface) 92%, transparent);
  color: var(--sidebar-text-muted);
  display: inline-flex;
  align-items: center;
}

.agent-badge.status-running {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 14%, var(--sidebar-border));
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.agent-badge.status-completed {
  color: var(--success-strong);
  border-color: color-mix(in srgb, var(--success) 14%, var(--sidebar-border));
  background: color-mix(in srgb, var(--success) 8%, transparent);
}

.agent-badge.status-failed {
  color: var(--danger-strong);
  border-color: color-mix(in srgb, var(--danger) 14%, var(--sidebar-border));
  background: color-mix(in srgb, var(--danger) 8%, transparent);
}

.final-summary {
  margin-top: 14px;
  line-height: 1.75;
  font-size: 15px;
}

.final-summary:first-child {
  margin-top: 0;
}

.message-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.inspect-btn {
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--sidebar-border);
  background: color-mix(in srgb, var(--sidebar-surface) 92%, transparent);
  color: var(--sidebar-text-soft);
  font-size: 12px;
  cursor: pointer;
  transition:
    border-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out),
    background var(--duration-fast) var(--ease-out);
}

.inspect-btn:hover {
  color: var(--text-strong);
  border-color: color-mix(in srgb, var(--accent) 18%, var(--sidebar-border));
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
</style>

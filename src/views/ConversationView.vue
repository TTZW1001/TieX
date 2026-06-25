<script setup lang="ts">
import { ref, watch, onMounted, nextTick, computed } from 'vue'
import { useRoute } from 'vue-router'
import { Shield, FolderOpen, TerminalSquare, PencilLine } from 'lucide-vue-next'
import { useChatStore } from '@/stores/chat.store'
import { useConversationStore } from '@/stores/conversation.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { useTaskStore } from '@/stores/task.store'
import MessageItem from '@/components/MessageItem.vue'
import ChatComposer from '@/components/ChatComposer.vue'
import ErrorAlert from '@/components/ErrorAlert.vue'

const chatStore = useChatStore()
const conversationStore = useConversationStore()
const workspaceStore = useWorkspaceStore()
const taskStore = useTaskStore()
const route = useRoute()
const messagesContainer = ref<HTMLElement | null>(null)
const loadingMore = ref(false)

const permissionMode = computed<'chat' | 'read' | 'execute' | 'command'>(() => {
  return workspaceStore.hasWorkspace ? 'command' : 'chat'
})

const permissionMeta = computed(() => {
  if (permissionMode.value === 'command') {
    return {
      label: '命令模式',
      detail: '允许读取、创建、编辑文件与执行受限命令',
      icon: TerminalSquare,
    }
  }

  if (permissionMode.value === 'execute') {
    return {
      label: '执行模式',
      detail: '允许读取、创建和编辑文件',
      icon: PencilLine,
    }
  }

  if (permissionMode.value === 'read') {
    return {
      label: '读取模式',
      detail: '仅允许 list_files、read_file、search_files',
      icon: Shield,
    }
  }

  return {
    label: '聊天模式',
    detail: '当前未绑定工作区，仅进行普通对话',
    icon: Shield,
  }
})

async function scrollToBottom() {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

watch(
  () => route.params.id,
  async (newId) => {
    if (newId && typeof newId === 'string') {
      conversationStore.setCurrentConversation(newId)
      await chatStore.loadMessages(newId)
      taskStore.loadConversationTasks(newId)
      scrollToBottom()
    }
  },
  { immediate: true }
)

watch(
  () => chatStore.messages.length,
  () => scrollToBottom()
)

watch(
  () => {
    const msgs = chatStore.messages
    if (msgs.length === 0) return ''
    return msgs[msgs.length - 1].content
  },
  () => scrollToBottom()
)

async function loadMore() {
  if (loadingMore.value) return
  loadingMore.value = true
  const container = messagesContainer.value
  const prevScrollHeight = container?.scrollHeight ?? 0

  try {
    await chatStore.loadMoreMessages()
    await nextTick()
    if (container) {
      container.scrollTop = container.scrollHeight - prevScrollHeight
    }
  } finally {
    loadingMore.value = false
  }
}

onMounted(() => {
  scrollToBottom()
  if (!workspaceStore.hasWorkspace) {
    workspaceStore.loadWorkspaces()
  }
})
</script>

<template>
  <div class="chat-layout">
    <div class="chat-main">
      <div class="session-strip" v-if="workspaceStore.hasWorkspace">
        <div class="session-pill">
          <component :is="permissionMeta.icon" :size="14" />
          <span>{{ permissionMeta.label }}</span>
        </div>
        <div class="session-copy">{{ permissionMeta.detail }}</div>
        <div class="session-pill workspace-tag">
          <FolderOpen :size="12" />
          <span>{{ workspaceStore.currentWorkspaceName }}</span>
        </div>
      </div>

      <div class="messages" ref="messagesContainer">
        <ErrorAlert
          v-if="chatStore.error"
          :code="chatStore.error.code"
          :message="chatStore.error.message"
          dismissible
          @dismiss="chatStore.error = null"
        />

        <div v-if="chatStore.hasMoreMessages" class="load-more">
          <button class="load-more-btn" @click="loadMore" :disabled="loadingMore">
            {{ loadingMore ? '加载中...' : '加载更早的消息' }}
          </button>
        </div>

        <MessageItem
          v-for="msg in chatStore.messages"
          :key="msg.id"
          :message="msg"
        />

        <div v-if="chatStore.messages.length === 0" class="empty-state">
          <div class="empty-mark display-serif">TieX</div>
          <div class="empty-text">等待第一条任务</div>
        </div>
      </div>

      <ChatComposer />
    </div>
  </div>
</template>

<style scoped>
.chat-layout {
  width: 100%;
  height: 100%;
  display: block;
}

.chat-main {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.session-strip {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px max(28px, calc((100% - 860px) / 2)) 0;
  color: var(--muted);
  font-size: 12px;
  flex-wrap: wrap;
}

.session-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--panel) 92%, transparent);
  border: 1px solid var(--line);
  color: var(--text-strong);
}

.session-copy {
  color: var(--muted-soft);
}

.workspace-tag {
  margin-left: auto;
}

.messages {
  flex: 1;
  overflow: auto;
  padding: 24px max(28px, calc((100% - 860px) / 2)) 16px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: var(--muted);
}

.empty-mark {
  font-size: 56px;
  color: color-mix(in srgb, var(--accent) 70%, var(--text));
  line-height: 1;
}

.empty-text {
  font-size: 15px;
}

.load-more {
  display: flex;
  justify-content: center;
  padding: 12px 0;
}

.load-more-btn {
  background: color-mix(in srgb, var(--panel) 88%, transparent);
  border: 1px solid var(--line);
  color: var(--text-strong);
  padding: 8px 18px;
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.load-more-btn:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--accent);
}

.load-more-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 900px) {
  .session-strip {
    padding-top: 12px;
  }

  .workspace-tag {
    margin-left: 0;
  }
}
</style>

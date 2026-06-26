<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useChatStore } from '@/stores/chat.store'
import { useConversationStore } from '@/stores/conversation.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { FolderOpen, Send } from 'lucide-vue-next'

const router = useRouter()
const chatStore = useChatStore()
const conversationStore = useConversationStore()
const workspaceStore = useWorkspaceStore()

const inputText = ref('')
const canCreateConversation = computed(() => !!inputText.value.trim())
const workspaceLabel = computed(() => (workspaceStore.hasWorkspace ? workspaceStore.currentWorkspaceName : '选择工作区'))
const statusLabel = computed(() => (workspaceStore.hasWorkspace ? '已连接本地工作区' : '未绑定工作区'))

async function selectWorkspace() {
  await workspaceStore.selectWorkspace()
}

async function createConversationFromInput() {
  const content = inputText.value.trim()
  if (!content) return

  const conv = await conversationStore.createConversation({
    title: content.slice(0, 30),
    workspace_id: workspaceStore.currentWorkspaceId,
    permission_mode: workspaceStore.hasWorkspace ? 'command' : 'chat',
  })

  if (!conv) return

  conversationStore.setCurrentConversation(conv.id)
  inputText.value = ''
  await router.push(`/conversation/${conv.id}`)

  try {
    if (workspaceStore.currentWorkspaceId) {
      await chatStore.sendAgentMessage(conv.id, content, {
        workspaceId: workspaceStore.currentWorkspaceId,
      })
    } else {
      await chatStore.sendMessage(conv.id, content)
    }

    conversationStore.loadConversations()
  } catch (err) {
    console.error('Failed to create conversation from home input:', err)
  }
}

function fillPrompt(value: string) {
  inputText.value = value
}

onMounted(() => {
  workspaceStore.loadWorkspaces()
  conversationStore.loadConversations()
})
</script>

<template>
  <div class="home">
    <section class="home-center">
      <h1>我们应该在 TieX 中构建什么？</h1>
      <p class="hero-copy">把项目、文档、命令和审批放进同一个本地 AI 工作台。</p>

      <div class="hero-status" aria-live="polite">
        <div class="status-pill status-live">
          <span class="status-dot" />
          <span>{{ statusLabel }}</span>
        </div>
      </div>

      <div class="prompt-shell">
        <textarea
          v-model="inputText"
          placeholder="例如：检查当前项目结构、生成说明文档，或修复一个具体问题"
          aria-label="输入任务"
          @keydown.enter.exact.prevent="createConversationFromInput"
        />

        <div class="prompt-footer">
          <button class="chip workspace-chip" @click="selectWorkspace">
            <FolderOpen :size="14" />
            <span>{{ workspaceLabel }}</span>
          </button>
          <button class="send-btn home-send" @click="createConversationFromInput" :disabled="!canCreateConversation">
            <Send :size="16" />
            <span>开始</span>
          </button>
        </div>
      </div>

      <div class="quick-actions">
        <button class="quick-action" @click="fillPrompt('梳理当前项目结构并说明关键模块')">梳理项目结构</button>
        <button class="quick-action" @click="fillPrompt('为当前项目生成一份使用说明文档')">生成使用文档</button>
        <button class="quick-action" @click="fillPrompt('检查当前项目中的问题并开始修复')">检查并修复</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home {
  height: 100%;
  overflow: auto;
  background:
    radial-gradient(circle at 50% 24%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 30%),
    var(--bg);
  color: var(--text);
}

.home-center {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 180px 24px 96px;
}

h1 {
  margin: 0 0 20px;
  font-size: clamp(18px, 2.2vw, 26px);
  line-height: 1.2;
  font-weight: 600;
  text-align: center;
  letter-spacing: -0.02em;
  white-space: nowrap;
  color: var(--text-strong);
}

.hero-copy {
  margin: 0 0 18px;
  color: var(--body);
  font-size: 15px;
  text-align: center;
}

.hero-status {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  margin-bottom: 18px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--panel) 88%, transparent);
  color: var(--text-strong);
  font-size: 12px;
  box-shadow: var(--shadow-soft);
}

.status-live {
  color: var(--success-strong);
}

.prompt-shell {
  width: min(760px, 92%);
  overflow: hidden;
  border-radius: 24px;
  background: color-mix(in srgb, var(--panel) 88%, transparent);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
  backdrop-filter: blur(12px);
  animation: homeRise var(--duration-slow) var(--ease-out);
}

.prompt-shell:focus-within {
  border-color: color-mix(in srgb, var(--accent) 48%, var(--line));
  box-shadow: var(--shadow-pop);
}

.prompt-shell textarea {
  width: 100%;
  min-height: 136px;
  padding: 20px 20px 0;
  resize: none;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font-size: 16px;
  line-height: 1.7;
}

.prompt-shell textarea:focus-visible {
  box-shadow: none;
}

.prompt-shell textarea::placeholder {
  color: var(--muted-soft);
}

.prompt-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px 20px;
}

.workspace-chip {
  max-width: 320px;
}

.workspace-chip span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.home-send {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.quick-actions {
  width: min(760px, 92%);
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 20px;
}

.quick-action {
  padding: 10px 14px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--panel) 70%, transparent);
  color: var(--text-strong);
  font-size: 13px;
}

.quick-action:hover {
  background: var(--panel-2);
  border-color: color-mix(in srgb, var(--accent) 30%, var(--line));
  transform: translateY(-1px);
}

@keyframes homeRise {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 820px) {
  .home-center {
    padding-top: 112px;
  }

  .prompt-shell textarea {
    min-height: 120px;
    font-size: 15px;
  }

  .prompt-footer {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>

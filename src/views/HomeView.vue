<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useChatStore } from '@/stores/chat.store'
import { useConversationStore } from '@/stores/conversation.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { FolderOpen, Plus, Send, Shield, Cpu, GitBranch, Monitor } from 'lucide-vue-next'

const router = useRouter()
const chatStore = useChatStore()
const conversationStore = useConversationStore()
const workspaceStore = useWorkspaceStore()

const inputText = ref('')

const currentWorkspaceLabel = computed(() => workspaceStore.currentWorkspaceName)
const currentModeLabel = computed(() => (workspaceStore.hasWorkspace ? '本地模式' : '对话模式'))

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
    if (workspaceStore.hasWorkspace && workspaceStore.currentWorkspaceId) {
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

      <div class="prompt-shell">
        <div class="prompt-main">
          <textarea
            v-model="inputText"
            placeholder="输入任务"
            @keydown.enter.exact.prevent="createConversationFromInput"
          />

          <div class="prompt-toolbar">
            <div class="toolbar-left">
              <button class="tool-btn" @click="selectWorkspace">
                <Plus :size="18" />
              </button>
              <button class="toolbar-chip">
                <Shield :size="16" />
                <span>{{ workspaceStore.hasWorkspace ? '请求批准' : '直接对话' }}</span>
              </button>
            </div>

            <div class="toolbar-right">
              <button class="toolbar-chip subtle-chip">
                <Cpu :size="16" />
                <span>DeepSeek</span>
              </button>
              <button class="send-btn home-send" @click="createConversationFromInput">
                <Send :size="16" />
              </button>
            </div>
          </div>
        </div>

        <div class="prompt-footer">
          <button class="footer-chip" @click="selectWorkspace">
            <FolderOpen :size="15" />
            <span>{{ currentWorkspaceLabel }}</span>
          </button>
          <div class="footer-chip">
            <Monitor :size="15" />
            <span>{{ currentModeLabel }}</span>
          </div>
          <div class="footer-chip">
            <GitBranch :size="15" />
            <span>main</span>
          </div>
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
  padding: 240px 24px 96px;
}

h1 {
  margin: 0 0 28px;
  font-size: clamp(18px, 2.2vw, 26px);
  line-height: 1.2;
  font-weight: 600;
  text-align: center;
  letter-spacing: -0.02em;
  white-space: nowrap;
  color: var(--text-strong);
}

.prompt-shell {
  width: min(760px, 92%);
  border-radius: 24px;
  overflow: hidden;
  background: color-mix(in srgb, var(--panel) 88%, transparent);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
  backdrop-filter: blur(12px);
}

.prompt-main {
  padding: 14px 14px 0;
}

.prompt-main textarea {
  width: 100%;
  min-height: 68px;
  resize: none;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font-size: 14px;
  line-height: 1.6;
}

.prompt-main textarea::placeholder {
  color: var(--muted-soft);
}

.prompt-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 0 10px;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tool-btn {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  color: var(--text-strong);
  background: transparent;
  border: 1px solid var(--line);
}

.tool-btn:hover {
  background: var(--panel-2);
}

.toolbar-chip,
.footer-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  color: var(--text-strong);
  background: var(--panel-2);
  border: 1px solid var(--line);
  font-size: 13px;
}

.subtle-chip {
  background: color-mix(in srgb, var(--panel-2) 80%, transparent);
}

.home-send {
  width: 38px;
  height: 38px;
  padding: 0;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}

.home-send:hover {
  background: var(--accent-active);
  border-color: var(--accent-active);
}

.prompt-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px 14px;
  background: var(--panel-2);
  border-top: 1px solid var(--line);
  flex-wrap: wrap;
}

.footer-chip span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
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
}

@media (max-width: 820px) {
  h1 {
    margin-bottom: 20px;
  }

  .prompt-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar-left,
  .toolbar-right {
    justify-content: space-between;
  }

  .prompt-main textarea {
    min-height: 64px;
    font-size: 14px;
  }
}
</style>

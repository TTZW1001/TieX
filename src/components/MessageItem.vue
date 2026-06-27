<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue'
import MarkdownIt from 'markdown-it'
import type { ChatMessage } from '@/stores/chat.store'
import { useWorkspaceStore } from '@/stores/workspace.store'

const appIconUrl = new URL('../../icon.png', import.meta.url).href
const props = defineProps<{
  message: ChatMessage
}>()
defineEmits<{
  (e: 'retry', message: ChatMessage): void
  (e: 'branch', message: ChatMessage): void
}>()

const workspaceStore = useWorkspaceStore()

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
})

const renderedContent = computed(() => {
  if (props.message.role === 'user') return props.message.content
  if (props.message.contentType === 'markdown' || props.message.role === 'assistant') {
    return md.render(props.message.content)
  }
  return props.message.content
})

const isUser = computed(() => props.message.role === 'user')
const isStreaming = computed(() => props.message.isStreaming === 1)
const hasError = computed(() => !!props.message.error)
const hasAttachments = computed(() => (props.message.attachments?.length ?? 0) > 0)

function openAttachment(path: string) {
  window.tiex?.shell.openPath(path)
}

/**
 * 规范化本地路径
 *  - file:///C:/xxx → C:\xxx
 *  - 相对路径        → 基于工作区根解析
 *  - Windows 绝对路径 → 原样返回
 */
function normalizeLocalPath(raw: string): string {
  let p = raw.trim()
  if (!p) return p

  // file:// 协议
  if (/^file:\/\/\//i.test(p)) {
    p = decodeURIComponent(p.replace(/^file:\/\/\//i, ''))
    // Windows: /C:/xxx → C:\xxx
    p = p.replace(/^\/([a-zA-Z]:)/, '$1').replace(/\//g, '\\')
    return p
  }
  if (/^file:\/\//i.test(p)) {
    return decodeURIComponent(p.replace(/^file:\/\//i, ''))
  }

  // 已经是 Windows 绝对路径
  if (/^[a-zA-Z]:[\\/]/.test(p)) return p

  // UNC 路径
  if (/^\\\\/.test(p)) return p

  // POSIX 绝对路径
  if (p.startsWith('/')) return p

  // 相对路径：基于工作区根解析
  const root = workspaceStore.currentWorkspacePath
  if (root) {
    const sep = root.includes('\\') ? '\\' : '/'
    const cleanRoot = root.replace(/[\\/]+$/, '')
    const cleanPath = p.replace(/^[\\/]+/, '')
    return `${cleanRoot}${sep}${cleanPath}`
  }

  return p
}

/**
 * 识别是否为"外链协议"
 */
function isExternalUrl(href: string): boolean {
  return /^https?:\/\//i.test(href) || /^(mailto|tel|ftp|sms):/i.test(href)
}

/**
 * 是否像"本地文件链接"
 *  - 含反斜杠 / 含盘符 / 以 .md .docx 等后缀结尾 / 相对路径（没有协议头）
 */
function looksLikeLocalFile(href: string): boolean {
  if (!href) return false
  // file: 协议（无论几个斜杠）
  if (/^file:/i.test(href)) return true
  // Windows 绝对路径
  if (/^[a-zA-Z]:[\\/]/.test(href)) return true
  // UNC
  if (/^\\\\/.test(href)) return true
  // POSIX 绝对路径
  if (href.startsWith('/')) return true
  // 常见文档后缀
  if (/\.(md|docx|pptx|xlsx|pdf|txt|json|ya?ml|toml|csv|html?|js|ts|vue|py|java|c|cpp|go|rs|sh|bat|ps1|sql|log)$/i.test(href)) return true
  // 相对路径（不含协议头、看起来像文件名）
  if (!/^[a-z]+:\/\//i.test(href) && /[\w\u4e00-\u9fa5]/.test(href)) return true
  return false
}

/**
 * 在 capture 阶段拦截 a 标签的点击
 * 优先级最高，能在浏览器默认导航之前阻止
 */
function captureLinkClick(event: MouseEvent): void {
  const target = event.target as HTMLElement | null
  if (!target) return
  const anchor = target.closest('a') as HTMLAnchorElement | null
  if (!anchor) return

  const href = anchor.getAttribute('href') || ''
  if (!href || href.startsWith('#') || href.startsWith('javascript:')) return

  // 外链：保留默认行为（不阻止），让浏览器打开
  if (isExternalUrl(href)) return

  // 本地文件（包括相对路径、绝对路径、file: 协议）：第一时刻阻止默认
  event.preventDefault()
  event.stopPropagation()
  if (typeof event.stopImmediatePropagation === 'function') {
    event.stopImmediatePropagation()
  }

  console.log('[MessageItem] intercept local link:', href)

  if (!window.tiex) {
    // 没有 IPC 能力时降级
    window.open(href, '_blank', 'noopener')
    return
  }

  // 本地文件
  const localPath = normalizeLocalPath(href)
  console.log('[MessageItem] open local file:', localPath)

  if (event.ctrlKey || event.metaKey) {
    window.tiex.shell.showInFolder(localPath).catch((err) => {
      console.error('[MessageItem] showInFolder failed:', err, localPath)
    })
  } else {
    window.tiex.shell
      .openPath(localPath)
      .then((result) => {
        if (result && !result.ok) {
          console.warn('[MessageItem] openPath failed:', result.error, localPath)
          window.tiex.shell.showInFolder(localPath).catch(() => {})
        }
      })
      .catch((err) => {
        console.error('[MessageItem] openPath error:', err, localPath)
      })
  }
}

/**
 * pointerdown 兜底：在鼠标按下时就阻止默认行为
 * 防止某些场景下 click 事件来不及触发，浏览器就已经开始导航
 */
function captureLinkPointerDown(event: MouseEvent): void {
  const target = event.target as HTMLElement | null
  if (!target) return
  const anchor = target.closest('a') as HTMLAnchorElement | null
  if (!anchor) return

  const href = anchor.getAttribute('href') || ''
  if (!href || href.startsWith('#') || href.startsWith('javascript:')) return
  if (isExternalUrl(href)) return // 外链保留默认行为
  if (!looksLikeLocalFile(href)) return // 既不是外链也不像本地文件，让浏览器自己处理

  // 本地文件：直接阻止 mousedown 的默认行为
  event.preventDefault()
  event.stopPropagation()
  if (typeof event.stopImmediatePropagation === 'function') {
    event.stopImmediatePropagation()
  }
}

onMounted(() => {
  // capture 阶段 + pointerdown 双重保险
  document.addEventListener('click', captureLinkClick, true)
  document.addEventListener('mousedown', captureLinkPointerDown, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', captureLinkClick, true)
  document.removeEventListener('mousedown', captureLinkPointerDown, true)
})
</script>

<template>
  <div class="message" :class="{ user: isUser }">
    <div class="avatar" :class="{ ai: !isUser }">
      <template v-if="isUser">我</template>
      <img v-else :src="appIconUrl" alt="TieX logo" />
    </div>
    <div class="bubble">
      <div class="author">{{ isUser ? '你' : 'TieX' }}</div>
      <div v-if="isUser" class="bubble-content user-content">
        {{ message.content }}
      </div>
      <div v-else class="bubble-content markdown-body" v-html="renderedContent"></div>
      <div v-if="hasAttachments" class="attachment-strip">
        <button
          v-for="attachment in message.attachments"
          :key="attachment.id"
          class="attachment-chip"
          @click="openAttachment(attachment.originalPath)"
        >
          <span class="attachment-kind">{{ attachment.kind === 'image' ? '图片' : '文件' }}</span>
          <span class="attachment-label">{{ attachment.fileName }}</span>
        </button>
      </div>
      <div class="message-actions" v-if="!isStreaming">
        <button class="action-btn" @click="$emit('branch', message)">从这里分支</button>
      </div>
      <div v-if="isStreaming" class="streaming-cursor"></div>
      <div v-if="hasError" class="error-block">
        <span class="error-text">{{ message.error!.message }}</span>
        <button class="retry-btn" @click="$emit('retry', message)">重试</button>
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

.attachment-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.attachment-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--sidebar-border);
  background: color-mix(in srgb, var(--sidebar-surface) 92%, transparent);
  color: var(--sidebar-text-soft);
  border-radius: 999px;
  padding: 8px 12px;
  cursor: pointer;
}

.attachment-kind {
  font-size: 11px;
  color: var(--muted-soft);
}

.attachment-label {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}

.action-btn {
  border: 1px solid var(--sidebar-border);
  background: transparent;
  color: var(--sidebar-text-muted);
  border-radius: 999px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12px;
}

.action-btn:hover {
  background: var(--sidebar-item-hover);
  color: var(--sidebar-text);
}

/* 用户消息：头像 + 气泡整体靠右 */
.message.user {
  flex-direction: row-reverse;
  margin-left: auto;
  width: fit-content;
  max-width: 85%;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--sidebar-bg) 65%, var(--sidebar-surface));
  display: grid;
  place-items: center;
  font-size: 13px;
  font-weight: 700;
  flex: 0 0 auto;
  color: var(--text);
  border: 1px solid var(--sidebar-border);
}

/* 用户头像：橙色主题，与品牌色一致 */
.avatar.user {
  background: color-mix(in srgb, var(--accent) 88%, #ffffff);
  color: #fffaf3;
}

/* AI 头像：始终用浅色背景，确保 logo 的橙+深蓝都清晰可见 */
.avatar.ai {
  background: #faf6ed;
  color: #1d1b19;
  overflow: hidden;
  border: 1px solid var(--sidebar-border);
}

.avatar.ai img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.bubble {
  min-width: 0;
  max-width: 780px;
}

/* 用户气泡：靠右、不限宽、由 message.user 容器控制整体位置 */
.message.user .bubble {
  max-width: 100%;
  text-align: right;
}

.message.user .author {
  text-align: right;
}

.author {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: var(--sidebar-text-muted);
  margin-bottom: 8px;
}

.bubble-content {
  line-height: 1.75;
  font-size: 15px;
  color: var(--text);
}

.user-content {
  display: inline-block;
  text-align: left;
  background: color-mix(in srgb, var(--sidebar-surface) 98%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 14%, var(--sidebar-border));
  padding: 14px 18px;
  border-radius: 20px 20px 8px 20px;
  color: var(--text-strong);
}

.streaming-cursor {
  display: inline-block;
  width: 2px;
  height: 16px;
  background: var(--accent);
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

.error-block {
  margin-top: 10px;
  padding: 10px 14px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--danger) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--danger) 14%, var(--sidebar-border));
  display: flex;
  align-items: center;
  gap: 12px;
}

.error-text {
  color: var(--danger-strong);
  font-size: 13px;
  flex: 1;
}

.retry-btn {
  padding: 4px 12px;
  border-radius: 8px;
  border: 1px solid var(--danger-strong);
  background: transparent;
  color: var(--danger-strong);
  cursor: pointer;
  font-size: 12px;
}

.retry-btn:hover {
  background: var(--danger-strong);
  color: var(--on-accent);
}
</style>

<style>
/* Markdown 渲染样式（非 scoped） */
.markdown-body {
  word-break: break-word;
  text-shadow: none;
  font-size: 15px;
  color: var(--text);
}

.markdown-body p {
  margin: 0 0 12px;
}

.markdown-body p:last-child {
  margin-bottom: 0;
}

.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4 {
  margin: 24px 0 12px;
  font-weight: 600;
  font-family: inherit;
  letter-spacing: -0.02em;
}

.markdown-body h1 { font-size: 1.5em; }
.markdown-body h2 { font-size: 1.3em; }
.markdown-body h3 { font-size: 1.15em; }

.markdown-body ul,
.markdown-body ol {
  padding-left: 24px;
  margin: 8px 0;
}

.markdown-body li {
  margin: 4px 0;
}

.markdown-body code {
  background: var(--code-inline-bg);
  color: var(--code-inline-text);
  border: 1px solid color-mix(in srgb, var(--code-border) 72%, transparent);
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 0.9em;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
}

.markdown-body pre {
  background: var(--code-block-bg);
  color: var(--code-block-text);
  border: 1px solid var(--code-border);
  border-radius: 14px;
  padding: 16px;
  overflow-x: auto;
  margin: 10px 0;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.markdown-body pre code {
  background: transparent;
  color: inherit;
  border: 0;
  padding: 0;
  font-size: 0.85em;
  line-height: 1.6;
}

.markdown-body blockquote {
  border-left: 3px solid var(--accent);
  padding-left: 14px;
  margin: 10px 0;
  color: var(--muted);
}

.markdown-body table {
  border-collapse: collapse;
  margin: 10px 0;
  width: 100%;
}

.markdown-body th,
.markdown-body td {
  border: 1px solid var(--line);
  padding: 8px 12px;
  text-align: left;
}

.markdown-body th {
  background: color-mix(in srgb, var(--sidebar-bg) 60%, transparent);
  font-weight: 600;
}

.markdown-body a {
  color: var(--accent);
  text-decoration: none;
}

.markdown-body a:hover {
  text-decoration: underline;
}

.markdown-body hr {
  border: 0;
  border-top: 1px solid var(--line);
  margin: 16px 0;
}
</style>

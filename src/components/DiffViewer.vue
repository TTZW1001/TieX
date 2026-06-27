<script setup lang="ts">
import { ref, computed } from 'vue'
import type { FileChangeInfo } from '@/types/global'

const props = defineProps<{
  change: FileChangeInfo
}>()

/** 折叠阈值：超过此行数自动折叠 */
const COLLAPSE_THRESHOLD = 20
/** 折叠后显示的上下文行数 */
const CONTEXT_LINES = 5

const expanded = ref(false)

interface DiffLine {
  type: 'add' | 'remove' | 'context'
  content: string
}

function parseDiffSummary(summary: string | null): DiffLine[] {
  if (!summary) return []

  const lines: DiffLine[] = []
  const rawLines = summary.split('\n')

  for (const raw of rawLines) {
    // 跳过 diff 头部信息（--- a/..., +++ b/..., @@ ... @@）
    if (raw.startsWith('--- ') || raw.startsWith('+++ ') || raw.startsWith('@@ ')) {
      continue
    }

    if (raw.startsWith('+')) {
      lines.push({ type: 'add', content: raw.slice(1) })
    } else if (raw.startsWith('-')) {
      lines.push({ type: 'remove', content: raw.slice(1) })
    } else {
      lines.push({ type: 'context', content: raw.startsWith(' ') ? raw.slice(1) : raw })
    }
  }

  return lines
}

const allDiffLines = parseDiffSummary(props.change.diff_summary)

/** 是否为长内容需要折叠 */
const isLongContent = computed(() => allDiffLines.length > COLLAPSE_THRESHOLD)

/** 显示的行（折叠时只显示前后各 CONTEXT_LINES 行） */
const displayedLines = computed(() => {
  if (!isLongContent.value || expanded.value) {
    return allDiffLines
  }
  // 折叠模式：显示前 N 行 + 省略 + 后 N 行
  const head = allDiffLines.slice(0, CONTEXT_LINES)
  const tail = allDiffLines.slice(-CONTEXT_LINES)
  return [...head, ...tail]
})

/** 省略的行数 */
const omittedCount = computed(() => {
  if (!isLongContent.value || expanded.value) return 0
  return allDiffLines.length - CONTEXT_LINES * 2
})

/** 省略号插入位置（在 head 之后） */
const omittedIndex = computed(() => {
  if (!isLongContent.value || expanded.value) return -1
  return CONTEXT_LINES
})

const operationLabel = props.change.operation === 'create' ? '新建' : '修改'
const operationClass = props.change.operation === 'create' ? 'op-create' : 'op-modify'

function formatSize(bytes: number | null): string {
  if (bytes === null) return '?'
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function toggleExpand() {
  expanded.value = !expanded.value
}
</script>

<template>
  <div class="diff">
    <div class="diff-head">
      <span class="op-badge" :class="operationClass">{{ operationLabel }}</span>
      <span class="file-path">{{ change.relative_path }}</span>
      <span class="size-info">
        {{ formatSize(change.before_size) }} → {{ formatSize(change.after_size) }}
      </span>
      <button
        v-if="isLongContent"
        class="collapse-btn"
        @click="toggleExpand"
      >
        {{ expanded ? '收起' : `展开全部 (${allDiffLines.length} 行)` }}
      </button>
    </div>
    <pre v-if="allDiffLines.length > 0"><code><template v-for="(line, idx) in displayedLines" :key="idx"><span v-if="idx === omittedIndex && !expanded" class="omit-marker">  ... 省略 {{ omittedCount }} 行 ...&#10;</span><span :class="line.type === 'add' ? 'plus' : line.type === 'remove' ? 'minus' : ''">{{ line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ' }}{{ line.content }}
</span></template></code></pre>
    <div v-else class="no-diff">
      {{ change.operation === 'create' ? '新文件，无差异对比' : '无详细差异信息' }}
    </div>
  </div>
</template>

<style scoped>
.diff {
  margin-top: 12px;
  border: 1px solid var(--code-border);
  border-radius: 14px;
  overflow: hidden;
  background: var(--code-block-bg);
  color: var(--code-block-text);
}

.diff-head {
  padding: 10px 12px;
  background: color-mix(in srgb, var(--panel-2) 82%, var(--code-bg));
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text);
}

.op-badge {
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 600;
}

.op-create {
  background: var(--success-soft);
  color: var(--success-strong);
}

.op-modify {
  background: var(--warning-soft);
  color: var(--warning-strong);
}

.file-path {
  font-family: Consolas, monospace;
  color: var(--text);
}

.size-info {
  color: var(--muted);
  font-size: 11px;
}

.collapse-btn {
  margin-left: auto;
  padding: 2px 10px;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--panel) 86%, var(--code-bg));
  color: var(--muted);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.collapse-btn:hover {
  color: var(--text);
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent-soft) 65%, var(--panel));
}

.diff pre {
  margin: 0;
  padding: 14px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.65;
  color: var(--code-block-text);
}

.plus {
  color: var(--diff-add-text);
}

.minus {
  color: var(--diff-remove-text);
}

.omit-marker {
  display: block;
  color: var(--muted);
  background: color-mix(in srgb, var(--panel) 72%, var(--code-bg));
  padding: 4px 0;
  font-style: italic;
  text-align: center;
  user-select: none;
}

.no-diff {
  padding: 14px;
  color: var(--muted);
  font-size: 12px;
  text-align: center;
}
</style>

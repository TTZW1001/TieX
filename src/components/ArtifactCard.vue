<script setup lang="ts">
import { FileText, FileSpreadsheet, Presentation, ExternalLink, FolderOpen } from 'lucide-vue-next'
import type { ArtifactInfo } from '@/types/global'

const props = defineProps<{
  artifact: ArtifactInfo
}>()

/** 格式化文件大小 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** 获取文件类型图标 */
function getTypeIcon() {
  switch (props.artifact.artifact_type) {
    case 'markdown':
      return FileText
    case 'docx':
      return FileSpreadsheet
    case 'pptx':
      return Presentation
    default:
      return FileText
  }
}

/** 获取类型标签 */
function getTypeLabel(): string {
  switch (props.artifact.artifact_type) {
    case 'markdown':
      return 'MD'
    case 'docx':
      return 'DOCX'
    case 'pptx':
      return 'PPTX'
    default:
      return props.artifact.artifact_type.toUpperCase()
  }
}

/** 打开文件 */
async function openFile() {
  try {
    await window.tiex.artifact.openFile(props.artifact.id)
  } catch (err) {
    console.error('Failed to open artifact file:', err)
  }
}

/** 打开所在目录 */
async function openFolder() {
  try {
    await window.tiex.artifact.openFolder(props.artifact.id)
  } catch (err) {
    console.error('Failed to open artifact folder:', err)
  }
}
</script>

<template>
  <div class="artifact-card">
    <div class="artifact-head">
      <component :is="getTypeIcon()" :size="16" class="artifact-icon" />
      <span class="artifact-name">{{ artifact.name }}</span>
      <span class="artifact-type-badge" :class="`type-${artifact.artifact_type}`">
        {{ getTypeLabel() }}
      </span>
    </div>
    <div class="artifact-meta">
      <span class="artifact-path">{{ artifact.relative_path }}</span>
      <span class="artifact-size">{{ formatSize(artifact.size_bytes) }}</span>
    </div>
    <div class="artifact-actions">
      <button class="action-btn" @click="openFile" title="打开文件">
        <ExternalLink :size="12" />
        打开
      </button>
      <button class="action-btn" @click="openFolder" title="打开所在目录">
        <FolderOpen :size="12" />
        目录
      </button>
    </div>
  </div>
</template>

<style scoped>
.artifact-card {
  padding: 10px;
  border-radius: 10px;
  background: var(--panel-2);
  margin-bottom: 10px;
}

.artifact-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  margin-bottom: 4px;
}

.artifact-icon {
  flex-shrink: 0;
  color: var(--accent);
}

.artifact-name {
  font-weight: 600;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.artifact-type-badge {
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  flex-shrink: 0;
}

.type-markdown {
  background: rgba(34, 197, 94, 0.15);
  color: var(--success);
}

.type-docx {
  background: rgba(79, 70, 229, 0.15);
  color: var(--accent);
}

.type-pptx {
  background: rgba(245, 158, 11, 0.15);
  color: var(--warning);
}

.artifact-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--muted);
  margin-bottom: 6px;
}

.artifact-path {
  font-family: 'Consolas', monospace;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.artifact-size {
  flex-shrink: 0;
}

.artifact-actions {
  display: flex;
  gap: 6px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 4px 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--panel);
  color: var(--muted);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn:hover {
  background: var(--accent-soft);
  color: var(--accent);
  border-color: var(--accent);
}
</style>

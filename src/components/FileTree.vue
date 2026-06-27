<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useWorkspaceStore } from '@/stores/workspace.store'
import type { FileEntry } from '@/types/global'
import {
  ChevronRight,
  Folder,
  FolderOpen,
  File as FileIcon,
  FileCode,
  FileText,
  Loader2,
} from 'lucide-vue-next'

const workspaceStore = useWorkspaceStore()

interface TreeNode {
  entry: FileEntry
  children: TreeNode[]
  loaded: boolean
  loading: boolean
  expanded: boolean
}

const rootNodes = ref<TreeNode[]>([])
const loading = ref(false)
const selectedPath = ref<string | null>(null)

const emit = defineEmits<{
  (e: 'select', entry: FileEntry): void
}>()

/** 需要灰色显示的目录 */
const GRAYED_DIRS = ['node_modules', '.git']

/** 根据扩展名获取文件图标 */
function getFileIcon(entry: FileEntry) {
  if (entry.type === 'directory') {
    return null
  }
  const codeExts = ['.ts', '.js', '.vue', '.json', '.py', '.java', '.rs', '.go', '.c', '.cpp', '.h', '.sh', '.ps1']
  const textExts = ['.md', '.txt', '.css', '.html', '.yaml', '.yml', '.toml', '.xml', '.env', '.sql']
  if (codeExts.includes(entry.extension)) return FileCode
  if (textExts.includes(entry.extension)) return FileText
  return FileIcon
}

/** 是否为灰色目录 */
function isGrayedDir(name: string): boolean {
  return GRAYED_DIRS.includes(name)
}

/** 将 FileEntry 列表转换为树结构 */
function buildTree(entries: FileEntry[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>()
  const roots: TreeNode[] = []

  // 先创建所有节点
  for (const entry of entries) {
    nodeMap.set(entry.path, {
      entry,
      children: [],
      loaded: entry.type !== 'directory',
      loading: false,
      expanded: false,
    })
  }

  // 构建父子关系
  for (const entry of entries) {
    const node = nodeMap.get(entry.path)!
    const lastSlash = entry.path.lastIndexOf('/')
    const parentPath = lastSlash > 0 ? entry.path.substring(0, lastSlash) : ''

    if (parentPath && nodeMap.has(parentPath)) {
      nodeMap.get(parentPath)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}

/** 加载根目录 */
async function loadRoot() {
  if (!workspaceStore.currentWorkspace) return
  loading.value = true
  try {
    const entries = await workspaceStore.listFiles('', 1)
    rootNodes.value = buildTree(entries)
  } catch (err) {
    console.error('Failed to load file tree:', err)
  } finally {
    loading.value = false
  }
}

/** 展开/收起目录 */
async function toggleNode(node: TreeNode) {
  if (node.entry.type !== 'directory') return

  if (!node.expanded) {
    node.expanded = true
    // 懒加载子目录
    if (!node.loaded) {
      node.loading = true
      try {
        const entries = await workspaceStore.listFiles(node.entry.path, 1)
        node.children = buildTree(entries)
        node.loaded = true
      } catch (err) {
        console.error('Failed to load directory:', err)
      } finally {
        node.loading = false
      }
    }
  } else {
    node.expanded = false
  }
}

/** 选择文件 */
function selectFile(node: TreeNode) {
  if (node.entry.type === 'file') {
    selectedPath.value = node.entry.path
    emit('select', node.entry)
  }
}

/** 监听工作区切换 */
watch(
  () => workspaceStore.currentWorkspaceId,
  () => {
    rootNodes.value = []
    selectedPath.value = null
    loadRoot()
  }
)

onMounted(() => {
  if (workspaceStore.currentWorkspace) {
    loadRoot()
  }
})
</script>

<template>
  <div class="file-tree">
    <div class="tree-header">
      <span>文件</span>
    </div>
    <div class="tree-body">
      <div v-if="loading" class="tree-loading">
        <Loader2 :size="16" class="spin" />
        <span>加载中...</span>
      </div>
      <div v-else-if="rootNodes.length === 0" class="tree-empty">
        <span>暂无文件</span>
      </div>
      <div v-else class="tree-list">
        <div
          v-for="node in rootNodes"
          :key="node.entry.path"
          class="tree-node-wrapper"
        >
          <div
            class="tree-node"
            :class="{
              'is-dir': node.entry.type === 'directory',
              'is-file': node.entry.type === 'file',
              'is-grayed': node.entry.type === 'directory' && isGrayedDir(node.entry.name),
              'is-selected': selectedPath === node.entry.path,
            }"
            @click="node.entry.type === 'directory' ? toggleNode(node) : selectFile(node)"
          >
            <ChevronRight
              v-if="node.entry.type === 'directory'"
              :size="14"
              class="chevron"
              :class="{ rotated: node.expanded }"
            />
            <span v-else class="chevron-placeholder"></span>

            <component
              v-if="node.entry.type === 'directory'"
              :is="node.expanded ? FolderOpen : Folder"
              :size="15"
              class="node-icon dir-icon"
            />
            <component
              v-else
              :is="getFileIcon(node.entry) || FileIcon"
              :size="15"
              class="node-icon file-icon"
            />

            <span class="node-name">{{ node.entry.name }}</span>

            <Loader2 v-if="node.loading" :size="12" class="spin node-loading" />
          </div>

          <!-- 子节点（展开时显示） -->
          <div v-if="node.expanded && node.children.length > 0" class="tree-children">
            <div
              v-for="child in node.children"
              :key="child.entry.path"
              class="tree-node-wrapper"
            >
              <div
                class="tree-node"
                :class="{
                  'is-dir': child.entry.type === 'directory',
                  'is-file': child.entry.type === 'file',
                  'is-grayed': child.entry.type === 'directory' && isGrayedDir(child.entry.name),
                  'is-selected': selectedPath === child.entry.path,
                }"
                @click="child.entry.type === 'directory' ? toggleNode(child) : selectFile(child)"
              >
                <ChevronRight
                  v-if="child.entry.type === 'directory'"
                  :size="14"
                  class="chevron"
                  :class="{ rotated: child.expanded }"
                />
                <span v-else class="chevron-placeholder"></span>

                <component
                  v-if="child.entry.type === 'directory'"
                  :is="child.expanded ? FolderOpen : Folder"
                  :size="15"
                  class="node-icon dir-icon"
                />
                <component
                  v-else
                  :is="getFileIcon(child.entry) || FileIcon"
                  :size="15"
                  class="node-icon file-icon"
                />

                <span class="node-name">{{ child.entry.name }}</span>

                <Loader2 v-if="child.loading" :size="12" class="spin node-loading" />
              </div>

              <!-- 递归子节点（仅一层，避免复杂递归） -->
              <div v-if="child.expanded && child.children.length > 0" class="tree-children">
                <div
                  v-for="grandchild in child.children"
                  :key="grandchild.entry.path"
                  class="tree-node"
                  :class="{
                    'is-dir': grandchild.entry.type === 'directory',
                    'is-file': grandchild.entry.type === 'file',
                    'is-grayed': grandchild.entry.type === 'directory' && isGrayedDir(grandchild.entry.name),
                    'is-selected': selectedPath === grandchild.entry.path,
                  }"
                  @click="grandchild.entry.type === 'directory' ? toggleNode(grandchild) : selectFile(grandchild)"
                >
                  <ChevronRight
                    v-if="grandchild.entry.type === 'directory'"
                    :size="14"
                    class="chevron"
                    :class="{ rotated: grandchild.expanded }"
                  />
                  <span v-else class="chevron-placeholder"></span>

                  <component
                    v-if="grandchild.entry.type === 'directory'"
                    :is="grandchild.expanded ? FolderOpen : Folder"
                    :size="15"
                    class="node-icon dir-icon"
                  />
                  <component
                    v-else
                    :is="getFileIcon(grandchild.entry) || FileIcon"
                    :size="15"
                    class="node-icon file-icon"
                  />

                  <span class="node-name">{{ grandchild.entry.name }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.tree-header {
  padding: 14px 16px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted-soft);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  border-bottom: 1px solid var(--sidebar-border);
  background: color-mix(in srgb, var(--sidebar-bg) 50%, transparent);
}

.tree-body {
  flex: 1;
  overflow: auto;
  padding: 8px 10px 10px;
}

.tree-loading,
.tree-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: var(--muted);
  font-size: 13px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.tree-list {
  display: flex;
  flex-direction: column;
}

.tree-node-wrapper {
  display: flex;
  flex-direction: column;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text);
  user-select: none;
  transition: background-color 120ms ease, color 120ms ease;
}

.tree-node:hover {
  background: var(--sidebar-item-hover);
}

.tree-node.is-selected {
  background: var(--sidebar-item-active);
  color: var(--text-strong);
}

.tree-node.is-grayed {
  color: var(--muted);
  opacity: 0.7;
}

.chevron {
  color: var(--muted);
  flex-shrink: 0;
  transition: transform 180ms ease, color 120ms ease;
}

.chevron.rotated {
  transform: rotate(90deg);
}

.chevron-placeholder {
  width: 14px;
  flex-shrink: 0;
}

.node-icon {
  flex-shrink: 0;
}

.dir-icon {
  color: var(--sidebar-text-soft);
}

.file-icon {
  color: var(--sidebar-text-muted);
}

.tree-node.is-selected .file-icon {
  color: var(--sidebar-text);
}

.tree-node.is-selected .dir-icon,
.tree-node:hover .dir-icon,
.tree-node:hover .file-icon,
.tree-node:hover .chevron {
  color: var(--sidebar-text);
}

.node-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.node-loading {
  color: var(--muted);
  flex-shrink: 0;
}

.tree-children {
  margin-left: 14px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>

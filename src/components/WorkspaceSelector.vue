<script setup lang="ts">
import { ref, computed } from 'vue'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { useUiStore } from '@/stores/ui.store'
import { FolderOpen, FolderPlus, ChevronDown, Check, Trash2, AlertCircle } from 'lucide-vue-next'

const workspaceStore = useWorkspaceStore()
const uiStore = useUiStore()
const showList = ref(false)

const currentWorkspace = computed(() => workspaceStore.currentWorkspace)
const workspaces = computed(() => workspaceStore.workspaces)

async function selectWorkspace() {
  await workspaceStore.selectWorkspace()
}

async function switchToWorkspace(id: string) {
  await workspaceStore.switchWorkspace(id)
  showList.value = false
}

async function deleteWorkspace(id: string, event: Event) {
  event.stopPropagation()
  const ok = await uiStore.confirm({
    title: '从列表移除工作区',
    message: '确定要从此列表中移除该工作区吗？',
    detail: '仅从 TieX 的工作区列表中移除，不会删除磁盘上的实际文件。',
    variant: 'warning',
    confirmText: '移除',
    cancelText: '取消',
  })
  if (ok) {
    await workspaceStore.deleteWorkspace(id)
  }
}

function toggleList() {
  showList.value = !showList.value
}

function formatPath(path: string): string {
  if (path.length > 40) {
    return '...' + path.slice(-37)
  }
  return path
}
</script>

<template>
  <div class="workspace-selector">
    <div class="current-workspace" @click="toggleList">
      <div class="ws-icon">
        <FolderOpen :size="18" />
      </div>
      <div class="ws-info" v-if="currentWorkspace">
        <div class="ws-name">{{ currentWorkspace.name }}</div>
        <div class="ws-path" :title="currentWorkspace.rootPath">
          {{ formatPath(currentWorkspace.rootPath) }}
        </div>
      </div>
      <div class="ws-info" v-else>
        <div class="ws-name">未选择工作区</div>
        <div class="ws-path">点击选择工作区</div>
      </div>
      <ChevronDown :size="16" class="ws-chevron" :class="{ rotated: showList }" />
    </div>

    <div class="workspace-dropdown" v-if="showList">
      <button class="select-btn" @click="selectWorkspace">
        <FolderPlus :size="16" />
        <span>选择工作区文件夹</span>
      </button>

      <div class="divider" v-if="workspaces.length > 0"></div>

      <div class="workspace-list" v-if="workspaces.length > 0">
        <div class="list-title">最近工作区</div>
        <div
          v-for="ws in workspaces"
          :key="ws.id"
          class="workspace-item"
          :class="{ active: currentWorkspace?.id === ws.id, unavailable: !ws.isAvailable }"
          @click="switchToWorkspace(ws.id)"
        >
          <div class="ws-item-icon">
            <FolderOpen :size="16" />
          </div>
          <div class="ws-item-info">
            <div class="ws-item-name">{{ ws.name }}</div>
            <div class="ws-item-path" :title="ws.rootPath">{{ formatPath(ws.rootPath) }}</div>
          </div>
          <Check :size="14" v-if="currentWorkspace?.id === ws.id" class="ws-check" />
          <AlertCircle :size="14" v-else-if="!ws.isAvailable" class="ws-warn" />
          <button class="ws-delete" @click="deleteWorkspace(ws.id, $event)" title="删除">
            <Trash2 :size="14" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workspace-selector {
  position: relative;
  width: 100%;
}

.current-workspace {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.current-workspace:hover {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--line));
  background: var(--panel-2);
}

.ws-icon {
  color: var(--accent);
  flex-shrink: 0;
}

.ws-info {
  flex: 1;
  min-width: 0;
}

.ws-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ws-path {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ws-chevron {
  color: var(--muted);
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.ws-chevron.rotated {
  transform: rotate(180deg);
}

.workspace-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 18px;
  box-shadow: var(--shadow);
  z-index: 100;
  padding: 8px;
  max-height: 360px;
  overflow: auto;
}

.select-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: 14px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}

.select-btn:hover {
  opacity: 0.85;
}

.divider {
  height: 1px;
  background: var(--line);
  margin: 8px 4px;
}

.list-title {
  font-size: 11px;
  color: var(--muted);
  padding: 6px 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.workspace-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 14px;
  cursor: pointer;
  position: relative;
}

.workspace-item:hover {
  background: var(--panel-2);
}

.workspace-item.active {
  background: var(--accent-soft);
}

.workspace-item.unavailable {
  opacity: 0.6;
}

.ws-item-icon {
  color: var(--muted);
  flex-shrink: 0;
}

.workspace-item.active .ws-item-icon {
  color: var(--accent);
}

.ws-item-info {
  flex: 1;
  min-width: 0;
}

.ws-item-name {
  font-size: 13px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ws-item-path {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ws-check {
  color: var(--accent);
  flex-shrink: 0;
}

.ws-warn {
  color: var(--warning);
  flex-shrink: 0;
}

.ws-delete {
  display: none;
  border: 0;
  background: transparent;
  color: var(--muted);
  padding: 4px;
  border-radius: 6px;
  cursor: pointer;
  flex-shrink: 0;
}

.workspace-item:hover .ws-delete {
  display: grid;
  place-items: center;
}

.ws-delete:hover {
  background: var(--danger);
  color: white;
}
</style>

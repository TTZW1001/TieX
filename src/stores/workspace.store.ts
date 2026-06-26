import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { WorkspaceInfo, FileEntry } from '@/types/global'

/**
 * workspace.store - 管理工作区列表、当前工作区、文件树状态
 */
export const useWorkspaceStore = defineStore('workspace', () => {
  const workspaces = ref<WorkspaceInfo[]>([])
  const currentWorkspace = ref<WorkspaceInfo | null>(null)
  const fileTree = ref<FileEntry[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const currentWorkspaceMemory = ref('')

  /** 当前工作区 ID */
  const currentWorkspaceId = computed(() => currentWorkspace.value?.id ?? null)

  /** 是否有工作区 */
  const hasWorkspace = computed(() => currentWorkspace.value !== null)

  /** 当前工作区名称 */
  const currentWorkspaceName = computed(() => currentWorkspace.value?.name ?? '未选择工作区')

  /** 当前工作区路径 */
  const currentWorkspacePath = computed(() => currentWorkspace.value?.rootPath ?? '')

  /**
   * 加载工作区列表
   */
  async function loadWorkspaces() {
    if (!window.tiex) return
    loading.value = true
    error.value = null
    try {
      workspaces.value = await window.tiex.workspace.list()
      // 如果没有当前工作区，但有工作区列表，自动选择第一个
      if (!currentWorkspace.value && workspaces.value.length > 0) {
        await switchWorkspace(workspaces.value[0].id)
      }
    } catch (err) {
      console.error('Failed to load workspaces:', err)
      error.value = (err as Error).message
    } finally {
      loading.value = false
    }
  }

  /**
   * 选择工作区（打开系统文件夹选择器）
   */
  async function selectWorkspace(): Promise<WorkspaceInfo | null> {
    if (!window.tiex) return null
    loading.value = true
    error.value = null
    try {
      const workspace = await window.tiex.workspace.select()
      if (workspace) {
        await loadWorkspaces()
        await switchWorkspace(workspace.id)
        return workspace
      }
      return null
    } catch (err) {
      console.error('Failed to select workspace:', err)
      error.value = (err as Error).message
      return null
    } finally {
      loading.value = false
    }
  }

  /**
   * 切换工作区
   */
  async function switchWorkspace(id: string): Promise<boolean> {
    if (!window.tiex) return false
    error.value = null
    try {
      const workspace = await window.tiex.workspace.switch(id)
      currentWorkspace.value = workspace
      const memory = await window.tiex.memory.getWorkspace(id)
      currentWorkspaceMemory.value = memory?.content ?? ''
      // 切换后重新加载文件树
      await loadFileTree()
      return true
    } catch (err) {
      console.error('Failed to switch workspace:', err)
      error.value = (err as Error).message
      return false
    }
  }

  /**
   * 删除工作区
   */
  async function deleteWorkspace(id: string): Promise<boolean> {
    if (!window.tiex) return false
    try {
      await window.tiex.workspace.delete(id)
      workspaces.value = workspaces.value.filter((w) => w.id !== id)
      if (currentWorkspace.value?.id === id) {
        currentWorkspace.value = null
        fileTree.value = []
        // 如果还有其他工作区，切换到第一个
        if (workspaces.value.length > 0) {
          await switchWorkspace(workspaces.value[0].id)
        }
      }
      return true
    } catch (err) {
      console.error('Failed to delete workspace:', err)
      error.value = (err as Error).message
      return false
    }
  }

  /**
   * 更新工作区信息
   */
  async function updateWorkspace(id: string, data: { name?: string; isFavorite?: boolean }): Promise<boolean> {
    if (!window.tiex) return false
    try {
      const updated = await window.tiex.workspace.update(id, data)
      if (updated) {
        const idx = workspaces.value.findIndex((w) => w.id === id)
        if (idx !== -1) {
          workspaces.value[idx] = updated
        }
        if (currentWorkspace.value?.id === id) {
          currentWorkspace.value = updated
        }
        return true
      }
      return false
    } catch (err) {
      console.error('Failed to update workspace:', err)
      error.value = (err as Error).message
      return false
    }
  }

  /**
   * 加载文件树（根目录）
   */
  async function loadFileTree(path: string = '', maxDepth: number = 1): Promise<void> {
    if (!window.tiex || !currentWorkspace.value) return
    try {
      const result = await window.tiex.file.list(currentWorkspace.value.id, {
        path,
        maxDepth,
      })
      fileTree.value = result.entries
    } catch (err) {
      console.error('Failed to load file tree:', err)
      error.value = (err as Error).message
    }
  }

  /**
   * 列出指定路径的文件
   */
  async function listFiles(path: string = '', maxDepth: number = 1): Promise<FileEntry[]> {
    if (!window.tiex || !currentWorkspace.value) return []
    try {
      const result = await window.tiex.file.list(currentWorkspace.value.id, {
        path,
        maxDepth,
      })
      return result.entries
    } catch (err) {
      console.error('Failed to list files:', err)
      error.value = (err as Error).message
      return []
    }
  }

  /**
   * 读取文件内容
   */
  async function readFile(
    path: string,
    startOffset?: number,
    maxLength?: number
  ): Promise<{ content: string; totalSize: number; isTruncated: boolean } | null> {
    if (!window.tiex || !currentWorkspace.value) return null
    try {
      const result = await window.tiex.file.read(currentWorkspace.value.id, {
        path,
        startOffset,
        maxLength,
      })
      return {
        content: result.content,
        totalSize: result.totalSize,
        isTruncated: result.isTruncated,
      }
    } catch (err) {
      console.error('Failed to read file:', err)
      error.value = (err as Error).message
      return null
    }
  }

  /**
   * 搜索文件
   */
  async function searchFiles(
    pattern: string,
    options?: { path?: string; filePattern?: string; searchContent?: boolean; maxResults?: number }
  ) {
    if (!window.tiex || !currentWorkspace.value) return []
    try {
      const result = await window.tiex.file.search(currentWorkspace.value.id, {
        pattern,
        path: options?.path,
        filePattern: options?.filePattern,
        searchContent: options?.searchContent,
        maxResults: options?.maxResults,
      })
      return result.results
    } catch (err) {
      console.error('Failed to search files:', err)
      error.value = (err as Error).message
      return []
    }
  }

  /**
   * 清除当前工作区
   */
  function clearCurrentWorkspace() {
    currentWorkspace.value = null
    fileTree.value = []
    currentWorkspaceMemory.value = ''
  }

  async function saveWorkspaceMemory(content: string): Promise<boolean> {
    if (!window.tiex || !currentWorkspace.value) return false
    try {
      await window.tiex.memory.setWorkspace(currentWorkspace.value.id, content)
      currentWorkspaceMemory.value = content
      return true
    } catch (err) {
      console.error('Failed to save workspace memory:', err)
      error.value = (err as Error).message
      return false
    }
  }

  return {
    workspaces,
    currentWorkspace,
    currentWorkspaceId,
    currentWorkspaceName,
    currentWorkspacePath,
    currentWorkspaceMemory,
    hasWorkspace,
    fileTree,
    loading,
    error,
    loadWorkspaces,
    selectWorkspace,
    switchWorkspace,
    deleteWorkspace,
    updateWorkspace,
    loadFileTree,
    listFiles,
    readFile,
    searchFiles,
    saveWorkspaceMemory,
    clearCurrentWorkspace,
  }
})

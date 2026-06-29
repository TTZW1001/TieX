import { contextBridge, ipcRenderer } from 'electron'
import type {
  ArtifactInfo,
  CommandOutputInfo,
  CommandSessionInfo,
  FileChangeInfo,
  OperationLogEntity,
  PermissionDecision,
  PermissionRequestInfo,
  ProviderInfo,
  StatsOverviewInfo,
  TaskEvent,
  TaskInfo,
  TaskStepEntity,
  ToolCallEntity,
} from '../../src/types/global'

const api = {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
  theme: {
    getSystem: (): Promise<boolean> => ipcRenderer.invoke('theme:getSystem'),
    set: (theme: 'light' | 'dark' | 'system') => ipcRenderer.send('theme:set', theme),
    onChanged: (callback: (isDark: boolean) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, isDark: boolean) => callback(isDark)
      ipcRenderer.on('theme:changed', handler)
      return () => ipcRenderer.removeListener('theme:changed', handler)
    },
  },
  settings: {
    get: (key: string): Promise<string | null> => ipcRenderer.invoke('settings:get', key),
    getAll: (): Promise<Record<string, string>> => ipcRenderer.invoke('settings:getAll'),
    getDataDirectory: (): Promise<string> => ipcRenderer.invoke('settings:getDataDirectory'),
    update: (key: string, value: string): Promise<void> =>
      ipcRenderer.invoke('settings:update', key, value),
  },
  provider: {
    list: (): Promise<ProviderInfo[]> => ipcRenderer.invoke('provider:list'),
    getDefault: (): Promise<ProviderInfo | null> => ipcRenderer.invoke('provider:getDefault'),
    getById: (id: string): Promise<ProviderInfo | null> => ipcRenderer.invoke('provider:getById', id),
    create: (data: Record<string, unknown>): Promise<ProviderInfo> =>
      ipcRenderer.invoke('provider:create', data),
    update: (id: string, data: Record<string, unknown>): Promise<void> =>
      ipcRenderer.invoke('provider:update', id, data),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke('provider:delete', id),
    testConnection: (id: string): Promise<{ success: boolean; message: string }> =>
      ipcRenderer.invoke('provider:testConnection', id),
    testDraft: (data: Record<string, unknown>): Promise<{ success: boolean; message: string }> =>
      ipcRenderer.invoke('provider:testDraft', data),
  },
  conversation: {
    create: (data?: Record<string, unknown>): Promise<any> =>
      ipcRenderer.invoke('conversation:create', data),
    getRecent: (limit?: number): Promise<any[]> =>
      ipcRenderer.invoke('conversation:getRecent', limit),
    getById: (id: string): Promise<any> => ipcRenderer.invoke('conversation:getById', id),
    updateTitle: (id: string, title: string): Promise<void> =>
      ipcRenderer.invoke('conversation:updateTitle', id, title),
    updateProvider: (id: string, providerId: string | null): Promise<void> =>
      ipcRenderer.invoke('conversation:updateProvider', id, providerId),
    updateWorkspace: (id: string, workspaceId: string | null): Promise<void> =>
      ipcRenderer.invoke('conversation:updateWorkspace', id, workspaceId),
    updatePermissionMode: (id: string, permissionMode: string): Promise<void> =>
      ipcRenderer.invoke('conversation:updatePermissionMode', id, permissionMode),
    branchFromMessage: (conversationId: string, messageId: string): Promise<any> =>
      ipcRenderer.invoke('conversation:branchFromMessage', conversationId, messageId),
    delete: (id: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('conversation:delete', id),
  },
  chat: {
    send: (conversationId: string, content: string, attachments?: Array<Record<string, unknown>>): Promise<any> =>
      ipcRenderer.invoke('chat:send', conversationId, content, attachments),
    stop: (conversationId: string): Promise<void> =>
      ipcRenderer.invoke('chat:stop', conversationId),
    getMessages: (conversationId: string): Promise<any[]> =>
      ipcRenderer.invoke('chat:getMessages', conversationId),
    getMessagesPaged: (conversationId: string, limit: number, offset: number): Promise<any[]> =>
      ipcRenderer.invoke('chat:getMessagesPaged', conversationId, limit, offset),
    countMessages: (conversationId: string): Promise<number> =>
      ipcRenderer.invoke('chat:countMessages', conversationId),
    onDelta: (callback: (data: any) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data)
      ipcRenderer.on('chat:delta', handler)
      return () => ipcRenderer.removeListener('chat:delta', handler)
    },
    onDone: (callback: (data: any) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data)
      ipcRenderer.on('chat:done', handler)
      return () => ipcRenderer.removeListener('chat:done', handler)
    },
    onError: (callback: (data: any) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data)
      ipcRenderer.on('chat:error', handler)
      return () => ipcRenderer.removeListener('chat:error', handler)
    },
  },
  workspace: {
    select: (): Promise<any> => ipcRenderer.invoke('workspace:select'),
    list: (): Promise<any[]> => ipcRenderer.invoke('workspace:list'),
    getById: (id: string): Promise<any> => ipcRenderer.invoke('workspace:getById', id),
    update: (id: string, data: Record<string, unknown>): Promise<any> =>
      ipcRenderer.invoke('workspace:update', id, data),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('workspace:delete', id),
    checkAvailable: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('workspace:checkAvailable', id),
    switch: (id: string): Promise<any> => ipcRenderer.invoke('workspace:switch', id),
  },
  memory: {
    getGlobal: (): Promise<string> => ipcRenderer.invoke('memory:getGlobal'),
    setGlobal: (content: string): Promise<void> => ipcRenderer.invoke('memory:setGlobal', content),
    getWorkspace: (workspaceId: string): Promise<any> => ipcRenderer.invoke('memory:getWorkspace', workspaceId),
    setWorkspace: (workspaceId: string, content: string): Promise<any> =>
      ipcRenderer.invoke('memory:setWorkspace', workspaceId, content),
    getCandidates: (status?: 'pending' | 'approved' | 'rejected'): Promise<any[]> =>
      ipcRenderer.invoke('memory:getCandidates', status),
    approveCandidate: (candidateId: string): Promise<void> =>
      ipcRenderer.invoke('memory:approveCandidate', candidateId),
    rejectCandidate: (candidateId: string): Promise<void> =>
      ipcRenderer.invoke('memory:rejectCandidate', candidateId),
    getConversationSummary: (conversationId: string): Promise<any> =>
      ipcRenderer.invoke('memory:getConversationSummary', conversationId),
  },
  file: {
    list: (workspaceId: string, input: Record<string, unknown>): Promise<any> =>
      ipcRenderer.invoke('file:list', workspaceId, input),
    read: (workspaceId: string, input: Record<string, unknown>): Promise<any> =>
      ipcRenderer.invoke('file:read', workspaceId, input),
    search: (workspaceId: string, input: Record<string, unknown>): Promise<any> =>
      ipcRenderer.invoke('file:search', workspaceId, input),
  },
  task: {
    start: (request: {
      conversationId: string
      content: string
      attachments?: Array<Record<string, unknown>>
      workspaceId?: string | null
      title?: string | null
    }): Promise<{ taskId: string; userMessageId: string }> => ipcRenderer.invoke('task:start', request),
    stop: (taskId: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('task:stop', taskId),
    getById: (taskId: string): Promise<TaskInfo | null> => ipcRenderer.invoke('task:getById', taskId),
    getByConversation: (conversationId: string): Promise<TaskInfo[]> =>
      ipcRenderer.invoke('task:getByConversation', conversationId),
    getSteps: (taskId: string): Promise<TaskStepEntity[]> =>
      ipcRenderer.invoke('task:getSteps', taskId),
    getToolCalls: (taskId: string): Promise<ToolCallEntity[]> =>
      ipcRenderer.invoke('task:getToolCalls', taskId),
    getLogs: (taskId: string): Promise<OperationLogEntity[]> => ipcRenderer.invoke('task:getLogs', taskId),
    rollback: (taskId: string): Promise<{ success: boolean; restoredCount: number; message?: string }> =>
      ipcRenderer.invoke('task:rollback', taskId),
    onEvent: (callback: (event: TaskEvent) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: TaskEvent) => callback(data)
      ipcRenderer.on('task:event', handler)
      return () => ipcRenderer.removeListener('task:event', handler)
    },
  },
  permission: {
    decide: (requestId: string, decision: PermissionDecision, decisionReason?: string | null): Promise<void> =>
      ipcRenderer.invoke('permission:decide', requestId, decision, decisionReason),
    getRequest: (requestId: string): Promise<PermissionRequestInfo | null> =>
      ipcRenderer.invoke('permission:getRequest', requestId),
    getByTask: (taskId: string): Promise<PermissionRequestInfo[]> =>
      ipcRenderer.invoke('permission:getByTask', taskId),
  },
  fileChange: {
    getByTask: (taskId: string): Promise<FileChangeInfo[]> =>
      ipcRenderer.invoke('fileChange:getByTask', taskId),
    restore: (fileChangeId: string): Promise<{ success: boolean; conflict?: boolean; message?: string }> =>
      ipcRenderer.invoke('fileChange:restore', fileChangeId),
  },
  artifact: {
    getByTask: (taskId: string): Promise<ArtifactInfo[]> =>
      ipcRenderer.invoke('artifact:getByTask', taskId),
    getById: (artifactId: string): Promise<ArtifactInfo | null> =>
      ipcRenderer.invoke('artifact:getById', artifactId),
    openFile: (artifactId: string): Promise<boolean> =>
      ipcRenderer.invoke('artifact:openFile', artifactId),
    openFolder: (artifactId: string): Promise<void> =>
      ipcRenderer.invoke('artifact:openFolder', artifactId),
    delete: (artifactId: string): Promise<void> =>
      ipcRenderer.invoke('artifact:delete', artifactId),
  },
  command: {
    stop: (sessionId: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('command:stop', sessionId),
    getOutput: (sessionId: string): Promise<CommandOutputInfo | null> =>
      ipcRenderer.invoke('command:getOutput', sessionId),
    getByTask: (taskId: string): Promise<CommandSessionInfo[]> =>
      ipcRenderer.invoke('command:getByTask', taskId),
  },
  shell: {
    /**
     * 用系统默认浏览器打开外部链接（仅 http/https）
     */
    openExternal: (url: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('shell:openExternal', url),
    /**
     * 用系统默认应用打开本地文件 / 目录
     * 支持普通路径或 file:// 协议
     */
    openPath: (filePath: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('shell:openPath', filePath),
    /**
     * 在文件资源管理器中高亮指定文件
     */
    showInFolder: (filePath: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('shell:showInFolder', filePath),
  },
  stats: {
    getOverview: (): Promise<StatsOverviewInfo> => ipcRenderer.invoke('stats:getOverview'),
    getConversationDetail: (conversationId: string): Promise<any> =>
      ipcRenderer.invoke('stats:getConversationDetail', conversationId),
  },
}

contextBridge.exposeInMainWorld('tiex', api)

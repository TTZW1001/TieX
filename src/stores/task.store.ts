import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  TaskEvent,
  TaskInfo,
  TaskStepEntity,
  ToolCallEntity,
  OperationLogEntity,
  CommandSessionInfo,
  ArtifactInfo,
  PermissionRequestInfo,
} from '@/types/global'
import { useUiStore } from './ui.store'

export const useTaskStore = defineStore('task', () => {
  // 当前活跃任务
  const currentTask = ref<TaskInfo | null>(null)
  // 当前会话的任务列表
  const conversationTasks = ref<TaskInfo[]>([])
  // 任务步骤
  const steps = ref<TaskStepEntity[]>([])
  // 工具调用
  const toolCalls = ref<ToolCallEntity[]>([])
  // 操作日志
  const logs = ref<OperationLogEntity[]>([])
  const stepsByTaskId = ref<Record<string, TaskStepEntity[]>>({})
  const toolCallsByTaskId = ref<Record<string, ToolCallEntity[]>>({})
  const logsByTaskId = ref<Record<string, OperationLogEntity[]>>({})
  // 任务生成物
  const artifacts = ref<ArtifactInfo[]>([])
  const artifactsByTaskId = ref<Record<string, ArtifactInfo[]>>({})
  // 任务审批记录
  const permissionRequests = ref<PermissionRequestInfo[]>([])
  const permissionRequestsByTaskId = ref<Record<string, PermissionRequestInfo[]>>({})
  // 是否正在运行任务
  const isRunning = ref(false)
  // 工具调用实时状态（按 toolCallId 索引）
  const toolCallStatus = ref<Map<string, { status: 'running' | 'completed' | 'failed'; result?: unknown; error?: string }>>(new Map())
  // 命令会话（按 sessionId 索引）
  const commandSessions = ref<Map<string, CommandSessionInfo>>(new Map())
  const commandSessionsByTaskId = ref<Record<string, CommandSessionInfo[]>>({})

  // 事件监听清理函数
  let cleanupEvent: (() => void) | null = null
  let refreshDetailsTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * 设置任务事件监听
   */
  function setupTaskEventListener() {
    if (!window.tiex) return
    if (cleanupEvent) return // 已设置

    cleanupEvent = window.tiex.task.onEvent((event: TaskEvent) => {
      handleTaskEvent(event)
    })
  }

  /**
   * 移除任务事件监听
   */
  function removeTaskEventListener() {
    cleanupEvent?.()
    cleanupEvent = null
  }

  /**
   * 处理任务事件
   */
  function handleTaskEvent(event: TaskEvent) {
    // 只处理当前任务的事件
    if (currentTask.value && event.taskId !== currentTask.value.id) return

    switch (event.type) {
      case 'task:started':
        isRunning.value = true
        if (currentTask.value) {
          currentTask.value.status = 'running'
        }
        break
      case 'task:statusChanged':
        if (currentTask.value && event.status) {
          currentTask.value.status = event.status
        }
        isRunning.value = event.status === 'running' || event.status === 'executing_tool' || event.status === 'waiting_permission'
        break
      case 'tool:started':
        if (event.toolCallId) {
          toolCallStatus.value.set(event.toolCallId, { status: 'running' })
          // 触发响应式更新
          toolCallStatus.value = new Map(toolCallStatus.value)
        }
        if (currentTask.value) {
          scheduleTaskDetailsRefresh(currentTask.value.id)
        }
        break
      case 'tool:completed':
        if (event.toolCallId) {
          toolCallStatus.value.set(event.toolCallId, { status: 'completed', result: event.result })
          toolCallStatus.value = new Map(toolCallStatus.value)
        }
        if (currentTask.value) {
          scheduleTaskDetailsRefresh(currentTask.value.id)
        }
        break
      case 'tool:failed':
        if (event.toolCallId) {
          toolCallStatus.value.set(event.toolCallId, { status: 'failed', error: event.error })
          toolCallStatus.value = new Map(toolCallStatus.value)
        }
        if (currentTask.value) {
          scheduleTaskDetailsRefresh(currentTask.value.id)
        }
        break
      case 'message:delta':
        // 文本增量由 chat.store 处理（通过更新消息内容）
        // 这里不需要处理，因为 agent-runtime 直接更新数据库中的消息
        break
      case 'task:completed':
        isRunning.value = false
        if (currentTask.value) {
          currentTask.value.status = 'completed'
        }
        // 刷新步骤和工具调用
        if (currentTask.value) {
          scheduleTaskDetailsRefresh(currentTask.value.id, 0)
        }
        break
      case 'task:failed':
        isRunning.value = false
        if (currentTask.value) {
          currentTask.value.status = 'failed'
        }
        if (currentTask.value) {
          scheduleTaskDetailsRefresh(currentTask.value.id, 0)
        }
        break
      case 'task:stopped':
        isRunning.value = false
        if (currentTask.value) {
          currentTask.value.status = 'stopped'
        }
        if (currentTask.value) {
          scheduleTaskDetailsRefresh(currentTask.value.id, 0)
        }
        break
      case 'permission:requested':
        // 打开权限审批对话框
        if (event.requestId) {
          const uiStore = useUiStore()
          uiStore.openPermissionDialog({
            requestId: event.requestId,
            taskId: event.taskId,
            toolName: event.toolName ?? '',
            title: event.title ?? '请求执行操作',
            reason: event.reason,
            target: event.target,
            impactSummary: event.impactSummary,
            riskLevel: event.riskLevel,
          })
        }
        if (currentTask.value) {
          loadPermissionRequests(currentTask.value.id)
        }
        break
      case 'permission:decided':
        // 权限决策已做出，关闭对话框
        {
          const uiStore = useUiStore()
          if (uiStore.permissionDialogOpen) {
            uiStore.closePermissionDialog()
          }
        }
        if (currentTask.value) {
          loadPermissionRequests(currentTask.value.id)
        }
        break
      case 'artifact:created':
        if (currentTask.value) {
          loadArtifacts(currentTask.value.id)
        }
        break
      case 'command:started':
        if (event.sessionId) {
          commandSessions.value.set(event.sessionId, {
            sessionId: event.sessionId,
            taskId: event.taskId,
            command: event.command || '',
            args: event.args || [],
            status: 'running',
            exitCode: null,
            output: '',
            truncated: false,
            startedAt: new Date().toISOString(),
            completedAt: null,
          })
          commandSessionsByTaskId.value = {
            ...commandSessionsByTaskId.value,
            [event.taskId]: upsertCommandSession(commandSessionsByTaskId.value[event.taskId] ?? [], commandSessions.value.get(event.sessionId)!),
          }
          commandSessions.value = new Map(commandSessions.value)
        }
        break
      case 'command:output':
        if (event.sessionId) {
          const existing = commandSessions.value.get(event.sessionId)
          if (existing) {
            existing.output += event.output || ''
            existing.truncated = event.truncated ?? false
            existing.status = 'running'
            commandSessionsByTaskId.value = {
              ...commandSessionsByTaskId.value,
              [event.taskId]: upsertCommandSession(commandSessionsByTaskId.value[event.taskId] ?? [], existing),
            }
            commandSessions.value = new Map(commandSessions.value)
          } else {
            const fallbackSession: CommandSessionInfo = {
              sessionId: event.sessionId,
              taskId: event.taskId,
              command: event.command || '命令执行中',
              args: event.args || [],
              status: 'running',
              exitCode: null,
              output: event.output || '',
              truncated: event.truncated ?? false,
              startedAt: new Date().toISOString(),
              completedAt: null,
            }
            commandSessions.value.set(event.sessionId, fallbackSession)
            commandSessionsByTaskId.value = {
              ...commandSessionsByTaskId.value,
              [event.taskId]: upsertCommandSession(commandSessionsByTaskId.value[event.taskId] ?? [], fallbackSession),
            }
            commandSessions.value = new Map(commandSessions.value)
          }
        }
        break
      case 'command:completed':
        if (event.sessionId) {
          const session = commandSessions.value.get(event.sessionId)
          if (session) {
            session.status = 'completed'
            session.exitCode = event.exitCode ?? null
            session.output = event.output ?? session.output
            session.completedAt = new Date().toISOString()
            commandSessionsByTaskId.value = {
              ...commandSessionsByTaskId.value,
              [event.taskId]: upsertCommandSession(commandSessionsByTaskId.value[event.taskId] ?? [], session),
            }
          } else {
            const fallbackSession: CommandSessionInfo = {
              sessionId: event.sessionId,
              taskId: event.taskId,
              command: '',
              args: [],
              status: 'completed',
              exitCode: event.exitCode ?? null,
              output: event.output ?? '',
              truncated: false,
              startedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
            }
            commandSessions.value.set(event.sessionId, fallbackSession)
            commandSessionsByTaskId.value = {
              ...commandSessionsByTaskId.value,
              [event.taskId]: upsertCommandSession(commandSessionsByTaskId.value[event.taskId] ?? [], fallbackSession),
            }
          }
          commandSessions.value = new Map(commandSessions.value)
        }
        break
      case 'command:failed':
        if (event.sessionId) {
          const session = commandSessions.value.get(event.sessionId)
          if (session) {
            session.status = 'failed'
            session.completedAt = new Date().toISOString()
            commandSessionsByTaskId.value = {
              ...commandSessionsByTaskId.value,
              [event.taskId]: upsertCommandSession(commandSessionsByTaskId.value[event.taskId] ?? [], session),
            }
          }
          commandSessions.value = new Map(commandSessions.value)
        }
        break
      case 'command:stopped':
        if (event.sessionId) {
          const session = commandSessions.value.get(event.sessionId)
          if (session) {
            session.status = 'stopped'
            session.completedAt = new Date().toISOString()
            commandSessionsByTaskId.value = {
              ...commandSessionsByTaskId.value,
              [event.taskId]: upsertCommandSession(commandSessionsByTaskId.value[event.taskId] ?? [], session),
            }
          }
          commandSessions.value = new Map(commandSessions.value)
        }
        break
      case 'command:timeout':
        if (event.sessionId) {
          const session = commandSessions.value.get(event.sessionId)
          if (session) {
            session.status = 'timeout'
            session.completedAt = new Date().toISOString()
            commandSessionsByTaskId.value = {
              ...commandSessionsByTaskId.value,
              [event.taskId]: upsertCommandSession(commandSessionsByTaskId.value[event.taskId] ?? [], session),
            }
          }
          commandSessions.value = new Map(commandSessions.value)
        }
        break
    }
  }

  /**
   * 启动 Agent 任务
   */
  async function startTask(request: {
    conversationId: string
    content: string
    workspaceId?: string | null
    title?: string | null
  }): Promise<string> {
    if (!window.tiex) throw new Error('IPC 不可用')
    setupTaskEventListener()
    isRunning.value = true
    toolCallStatus.value = new Map()

    const result = await window.tiex.task.start(request)

    // 设置当前任务
    currentTask.value = {
      id: result.taskId,
      conversationId: request.conversationId,
      userMessageId: null,
      assistantMessageId: null,
      providerId: '',
      workspaceId: request.workspaceId ?? null,
      permissionMode: 'execute',
      status: 'pending',
      title: request.title ?? null,
      errorCode: null,
      errorMessage: null,
      roundCount: 0,
      toolCallCount: 0,
      failureCount: 0,
      startedAt: null,
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    return result.taskId
  }

  /**
   * 停止当前任务
   */
  async function stopTask() {
    if (!window.tiex || !currentTask.value) return
    try {
      await window.tiex.task.stop(currentTask.value.id)
    } catch (err) {
      console.error('Failed to stop task:', err)
    }
  }

  async function rollbackTask(taskId: string): Promise<{ success: boolean; restoredCount: number; message?: string }> {
    if (!window.tiex) return { success: false, restoredCount: 0, message: 'IPC 不可用' }
    try {
      return await window.tiex.task.rollback(taskId)
    } catch (err: any) {
      console.error('Failed to rollback task:', err)
      return { success: false, restoredCount: 0, message: err?.message || '回滚失败' }
    }
  }

  /**
   * 加载会话的任务列表
   */
  async function loadConversationTasks(conversationId: string) {
    if (!window.tiex) return
    try {
      const tasks = await window.tiex.task.getByConversation(conversationId)
      conversationTasks.value = [...tasks].sort((a, b) => {
        const timeA = new Date(a.createdAt).getTime()
        const timeB = new Date(b.createdAt).getTime()
        return timeB - timeA
      })
      await preloadConversationTaskHistory(conversationTasks.value.map((task) => task.id))
    } catch (err) {
      console.error('Failed to load conversation tasks:', err)
    }
  }

  /**
   * 设置当前任务并加载详情
   */
  async function setCurrentTask(taskId: string | null) {
    if (!window.tiex) return
    if (!taskId) {
      currentTask.value = null
      steps.value = []
      toolCalls.value = []
      logs.value = []
      artifacts.value = []
      permissionRequests.value = []
      return
    }

    try {
      const task = await window.tiex.task.getById(taskId)
      currentTask.value = task
      if (task) {
        await Promise.all([
          refreshTaskDetails(taskId),
          loadArtifacts(taskId),
          loadPermissionRequests(taskId),
          loadCommandSessions(taskId),
        ])
        isRunning.value = task.status === 'running' || task.status === 'executing_tool' || task.status === 'pending'
        if (isRunning.value) {
          setupTaskEventListener()
        }
      }
    } catch (err) {
      console.error('Failed to load task:', err)
    }
  }

  /**
   * 刷新任务详情（步骤、工具调用、日志）
   */
  async function refreshTaskDetails(taskId: string) {
    if (!window.tiex) return
    try {
      const [taskSteps, taskToolCalls, taskLogs] = await Promise.all([
        window.tiex.task.getSteps(taskId),
        window.tiex.task.getToolCalls(taskId),
        window.tiex.task.getLogs(taskId),
      ])
      stepsByTaskId.value = { ...stepsByTaskId.value, [taskId]: taskSteps }
      toolCallsByTaskId.value = { ...toolCallsByTaskId.value, [taskId]: taskToolCalls }
      logsByTaskId.value = { ...logsByTaskId.value, [taskId]: taskLogs }
      if (currentTask.value?.id === taskId) {
        steps.value = taskSteps
        toolCalls.value = taskToolCalls
        logs.value = taskLogs
      }
    } catch (err) {
      console.error('Failed to refresh task details:', err)
    }
  }

  async function preloadConversationTaskHistory(taskIds: string[]) {
    if (!window.tiex || taskIds.length === 0) return
    const uniqueTaskIds = Array.from(new Set(taskIds)).filter((taskId) => !!taskId)
    await Promise.all(uniqueTaskIds.map(async (taskId) => {
      await Promise.all([
        refreshTaskDetails(taskId),
        loadArtifacts(taskId),
        loadPermissionRequests(taskId),
        loadCommandSessions(taskId),
      ])
    }))
  }

  function upsertCommandSession(list: CommandSessionInfo[], session: CommandSessionInfo): CommandSessionInfo[] {
    const index = list.findIndex((item) => item.sessionId === session.sessionId)
    const next = [...list]
    if (index >= 0) {
      next[index] = { ...next[index], ...session }
    } else {
      next.push(session)
    }
    return next.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
  }

  function scheduleTaskDetailsRefresh(taskId: string, delayMs: number = 120) {
    if (refreshDetailsTimer) {
      clearTimeout(refreshDetailsTimer)
      refreshDetailsTimer = null
    }
    refreshDetailsTimer = setTimeout(() => {
      refreshDetailsTimer = null
      refreshTaskDetails(taskId)
    }, delayMs)
  }

  async function loadArtifacts(taskId: string) {
    if (!window.tiex) return
    try {
      const taskArtifacts = await window.tiex.artifact.getByTask(taskId)
      artifactsByTaskId.value = { ...artifactsByTaskId.value, [taskId]: taskArtifacts }
      if (currentTask.value?.id === taskId) {
        artifacts.value = taskArtifacts
      }
    } catch (err) {
      console.error('Failed to load artifacts:', err)
      artifactsByTaskId.value = { ...artifactsByTaskId.value, [taskId]: [] }
      if (currentTask.value?.id === taskId) {
        artifacts.value = []
      }
    }
  }

  async function loadPermissionRequests(taskId: string) {
    if (!window.tiex) return
    try {
      const taskPermissionRequests = await window.tiex.permission.getByTask(taskId)
      permissionRequestsByTaskId.value = { ...permissionRequestsByTaskId.value, [taskId]: taskPermissionRequests }
      if (currentTask.value?.id === taskId) {
        permissionRequests.value = taskPermissionRequests
      }
    } catch (err) {
      console.error('Failed to load permission requests:', err)
      permissionRequestsByTaskId.value = { ...permissionRequestsByTaskId.value, [taskId]: [] }
      if (currentTask.value?.id === taskId) {
        permissionRequests.value = []
      }
    }
  }

  async function loadCommandSessions(taskId: string) {
    if (!window.tiex) return
    try {
      const taskCommandSessions = await window.tiex.command.getByTask(taskId)
      commandSessionsByTaskId.value = { ...commandSessionsByTaskId.value, [taskId]: taskCommandSessions }
      const nextMap = new Map(commandSessions.value)
      for (const session of taskCommandSessions) {
        nextMap.set(session.sessionId, session)
      }
      commandSessions.value = nextMap
    } catch (err) {
      console.error('Failed to load command sessions:', err)
      commandSessionsByTaskId.value = { ...commandSessionsByTaskId.value, [taskId]: [] }
    }
  }

  /**
   * 清理状态
   */
  function clear() {
    if (refreshDetailsTimer) {
      clearTimeout(refreshDetailsTimer)
      refreshDetailsTimer = null
    }
    currentTask.value = null
    conversationTasks.value = []
    steps.value = []
    stepsByTaskId.value = {}
    toolCalls.value = []
    toolCallsByTaskId.value = {}
    logs.value = []
    logsByTaskId.value = {}
    artifacts.value = []
    artifactsByTaskId.value = {}
    permissionRequests.value = []
    permissionRequestsByTaskId.value = {}
    isRunning.value = false
    toolCallStatus.value = new Map()
    commandSessions.value = new Map()
    commandSessionsByTaskId.value = {}
    removeTaskEventListener()
  }

  return {
    currentTask,
    conversationTasks,
    steps,
    stepsByTaskId,
    toolCalls,
    toolCallsByTaskId,
    logs,
    logsByTaskId,
    artifacts,
    artifactsByTaskId,
    permissionRequests,
    permissionRequestsByTaskId,
    isRunning,
    toolCallStatus,
    commandSessions,
    commandSessionsByTaskId,
    startTask,
    stopTask,
    rollbackTask,
    loadConversationTasks,
    setCurrentTask,
    refreshTaskDetails,
    preloadConversationTaskHistory,
    loadArtifacts,
    loadPermissionRequests,
    loadCommandSessions,
    clear,
    setupTaskEventListener,
    removeTaskEventListener,
  }
})

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { TaskEvent, TaskInfo, TaskStepEntity, ToolCallEntity, OperationLogEntity, CommandSessionInfo } from '@/types/global'
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
  // 是否正在运行任务
  const isRunning = ref(false)
  // 工具调用实时状态（按 toolCallId 索引）
  const toolCallStatus = ref<Map<string, { status: 'running' | 'completed' | 'failed'; result?: unknown; error?: string }>>(new Map())
  // 命令会话（按 sessionId 索引）
  const commandSessions = ref<Map<string, CommandSessionInfo>>(new Map())

  // 事件监听清理函数
  let cleanupEvent: (() => void) | null = null

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
        break
      case 'tool:completed':
        if (event.toolCallId) {
          toolCallStatus.value.set(event.toolCallId, { status: 'completed', result: event.result })
          toolCallStatus.value = new Map(toolCallStatus.value)
        }
        break
      case 'tool:failed':
        if (event.toolCallId) {
          toolCallStatus.value.set(event.toolCallId, { status: 'failed', error: event.error })
          toolCallStatus.value = new Map(toolCallStatus.value)
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
          refreshTaskDetails(currentTask.value.id)
        }
        break
      case 'task:failed':
        isRunning.value = false
        if (currentTask.value) {
          currentTask.value.status = 'failed'
        }
        if (currentTask.value) {
          refreshTaskDetails(currentTask.value.id)
        }
        break
      case 'task:stopped':
        isRunning.value = false
        if (currentTask.value) {
          currentTask.value.status = 'stopped'
        }
        if (currentTask.value) {
          refreshTaskDetails(currentTask.value.id)
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
        break
      case 'permission:decided':
        // 权限决策已做出，关闭对话框
        {
          const uiStore = useUiStore()
          if (uiStore.permissionDialogOpen) {
            uiStore.closePermissionDialog()
          }
        }
        break
      case 'command:output':
        if (event.sessionId) {
          const existing = commandSessions.value.get(event.sessionId)
          if (existing) {
            existing.output += event.output || ''
            existing.truncated = event.truncated ?? false
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
          } else {
            commandSessions.value.set(event.sessionId, {
              sessionId: event.sessionId,
              command: '',
              args: [],
              status: 'completed',
              exitCode: event.exitCode ?? null,
              output: event.output ?? '',
              truncated: false,
              startedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
            })
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

  /**
   * 加载会话的任务列表
   */
  async function loadConversationTasks(conversationId: string) {
    if (!window.tiex) return
    try {
      conversationTasks.value = await window.tiex.task.getByConversation(conversationId)
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
      return
    }

    try {
      const task = await window.tiex.task.getById(taskId)
      currentTask.value = task
      if (task) {
        await refreshTaskDetails(taskId)
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
      steps.value = taskSteps
      toolCalls.value = taskToolCalls
      logs.value = taskLogs
    } catch (err) {
      console.error('Failed to refresh task details:', err)
    }
  }

  /**
   * 清理状态
   */
  function clear() {
    currentTask.value = null
    conversationTasks.value = []
    steps.value = []
    toolCalls.value = []
    logs.value = []
    isRunning.value = false
    toolCallStatus.value = new Map()
    commandSessions.value = new Map()
    removeTaskEventListener()
  }

  return {
    currentTask,
    conversationTasks,
    steps,
    toolCalls,
    logs,
    isRunning,
    toolCallStatus,
    commandSessions,
    startTask,
    stopTask,
    loadConversationTasks,
    setCurrentTask,
    refreshTaskDetails,
    clear,
    setupTaskEventListener,
    removeTaskEventListener,
  }
})

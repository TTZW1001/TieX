/**
 * Task Controller - 任务创建、状态管理、停止
 */
import { randomUUID } from 'crypto'
import { safeStorage } from 'electron'
import { TaskRepository } from '../database/repositories/task.repository'
import { TaskStepRepository } from '../database/repositories/task-step.repository'
import { OperationLogRepository } from '../database/repositories/operation-log.repository'
import { MessageRepository } from '../database/repositories/message.repository'
import { ConversationRepository } from '../database/repositories/conversation.repository'
import { ProviderRepository } from '../database/repositories/provider.repository'
import { WorkspaceRepository } from '../database/repositories/workspace.repository'
import type { ProviderConfig } from '../providers/model-provider'
import type {
  TaskEntity,
  TaskStatus,
  PermissionMode,
  CreateTaskRequest,
  TaskInfo,
} from '../../shared/types'
import { taskEventBus } from '../shared/event-bus'

const taskRepo = new TaskRepository()
const taskStepRepo = new TaskStepRepository()
const operationLogRepo = new OperationLogRepository()
const messageRepo = new MessageRepository()
const conversationRepo = new ConversationRepository()
const providerRepo = new ProviderRepository()
const workspaceRepo = new WorkspaceRepository()

/** 运行时上下文 */
export interface RuntimeContext {
  taskId: string
  conversationId: string
  providerId: string
  workspaceId?: string | null
  workspaceRoot?: string
  workspaceName?: string
  workspaceRootName?: string
  permissionMode: PermissionMode
  providerConfig: ProviderConfig
  userContent: string
  userMessageId: string

  round: number
  toolCallCount: number
  failureCount: number
  startedAt: number

  abortController: AbortController
}

/** 任务限制 */
export interface TaskLimits {
  maxModelRounds: number
  maxToolCalls: number
  maxFailures: number
  maxDurationMs: number
  maxFilesRead: number
  maxFileSizeBytes: number
  maxChangedFiles: number
  maxToolOutputChars: number
}

class TaskControllerImpl {
  /** 活跃任务的运行时上下文 */
  private runtimes = new Map<string, RuntimeContext>()

  /**
   * 创建任务并准备运行时上下文
   */
  async createTask(request: CreateTaskRequest): Promise<{ taskId: string; runtime: RuntimeContext }> {
    // 校验参数
    if (!request.conversationId || typeof request.conversationId !== 'string') {
      throw new Error('conversationId 不能为空')
    }
    if (!request.content || typeof request.content !== 'string' || !request.content.trim()) {
      throw new Error('任务内容不能为空')
    }

    // 获取会话
    const conversation = conversationRepo.getById(request.conversationId)
    if (!conversation) {
      throw new Error('会话不存在')
    }

    // 获取 Provider
    const providerId = conversation.provider_id
    if (!providerId) {
      throw new Error('会话未关联模型服务商')
    }
    const providerConfig = await this.getProviderConfig(providerId)

    // 获取工作区信息
    let workspaceRoot: string | undefined
    let workspaceName: string | undefined
    let workspaceRootName: string | undefined
    const workspaceId = request.workspaceId || conversation.workspace_id
    if (workspaceId) {
      const workspace = workspaceRepo.getById(workspaceId)
      if (workspace && workspace.is_available === 1) {
        workspaceRoot = workspace.root_path
        workspaceName = workspace.name
        workspaceRootName = workspace.root_path.split(/[\\/]/).pop() || workspace.name
      }
    }

    // 创建用户消息
    const latestMsg = messageRepo.getLatestByConversationId(request.conversationId)
    const nextSeq = (latestMsg?.sequence_no ?? 0) + 1
    const userMessage = messageRepo.create({
      conversation_id: request.conversationId,
      role: 'user',
      content: request.content.trim(),
      sequence_no: nextSeq,
    })

    // 自动标题
    if (conversation.title === '新对话') {
      const autoTitle = request.content.trim().slice(0, 30) + (request.content.trim().length > 30 ? '...' : '')
      conversationRepo.updateTitle(request.conversationId, autoTitle)
    }

    // 创建任务记录
    const taskId = randomUUID()
    // 阶段八：有工作区时默认使用 command 模式（支持命令执行）
    const permissionMode: PermissionMode = workspaceRoot ? 'command' : 'chat'
    taskRepo.create({
      id: taskId,
      conversation_id: request.conversationId,
      user_message_id: userMessage.id,
      provider_id: providerId,
      workspace_id: workspaceId ?? null,
      permission_mode: permissionMode,
      title: request.title ?? request.content.trim().slice(0, 50),
    })

    // 记录操作日志
    operationLogRepo.create({
      task_id: taskId,
      conversation_id: request.conversationId,
      log_type: 'task_created',
      message: `任务创建: ${request.content.trim().slice(0, 100)}`,
    })

    // 构建运行时上下文
    const runtime: RuntimeContext = {
      taskId,
      conversationId: request.conversationId,
      providerId,
      workspaceId: workspaceId ?? null,
      workspaceRoot,
      workspaceName,
      workspaceRootName,
      permissionMode,
      providerConfig,
      userContent: request.content.trim(),
      userMessageId: userMessage.id,
      round: 0,
      toolCallCount: 0,
      failureCount: 0,
      startedAt: Date.now(),
      abortController: new AbortController(),
    }

    this.runtimes.set(taskId, runtime)

    return { taskId, runtime }
  }

  /**
   * 更新任务状态
   */
  updateTaskStatus(taskId: string, status: TaskStatus, extra?: {
    errorCode?: string
    errorMessage?: string
  }): void {
    const now = new Date().toISOString()
    const updateData: any = {}
    if (status === 'running' || status === 'executing_tool') {
      updateData.started_at = now
    }
    if (status === 'completed' || status === 'failed' || status === 'stopped' || status === 'interrupted') {
      updateData.completed_at = now
    }
    if (extra?.errorCode) updateData.error_code = extra.errorCode
    if (extra?.errorMessage) updateData.error_message = extra.errorMessage

    taskRepo.updateStatus(taskId, status, updateData)

    // 推送事件
    taskEventBus.emit({ type: 'task:statusChanged', taskId, status })
  }

  /**
   * 停止任务
   */
  async stop(taskId: string): Promise<void> {
    const runtime = this.runtimes.get(taskId)
    if (runtime) {
      runtime.abortController.abort()
    }
    // 取消所有待处理的权限请求
    try {
      const { permissionService } = require('../services/permission.service')
      permissionService.cancelPendingRequests(taskId)
    } catch {}
  }

  /**
   * 获取运行时上下文
   */
  getRuntime(taskId: string): RuntimeContext | null {
    return this.runtimes.get(taskId) ?? null
  }

  /**
   * 清理任务资源
   */
  cleanup(taskId: string): void {
    this.runtimes.delete(taskId)
  }

  /**
   * 获取所有运行中的任务
   */
  getRunningTasks(): TaskEntity[] {
    return taskRepo.getRunningTasks()
  }

  /**
   * 将所有运行中的任务标记为 interrupted（应用退出时调用）
   */
  interruptAllRunningTasks(): void {
    const runningTasks = this.getRunningTasks()
    for (const task of runningTasks) {
      // 中止运行时
      const runtime = this.runtimes.get(task.id)
      if (runtime) {
        runtime.abortController.abort()
      }
      // 标记为 interrupted
      try {
        this.updateTaskStatus(task.id, 'interrupted', {
          errorCode: 'INTERRUPTED',
          errorMessage: '应用退出，任务被中断',
        })
      } catch (err) {
        console.error('Failed to mark task as interrupted:', task.id, err)
      }
    }
    this.runtimes.clear()
  }

  /**
   * 获取解密后的 Provider 配置
   */
  private async getProviderConfig(providerId: string): Promise<ProviderConfig> {
    const provider = providerRepo.getById(providerId)
    if (!provider) {
      throw new Error('模型服务商配置不存在')
    }

    let apiKey = ''
    const encrypted = providerRepo.getEncryptedApiKey(providerId)
    if (encrypted) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('系统不支持安全存储')
      }
      apiKey = safeStorage.decryptString(encrypted)
    }

    return {
      id: provider.id,
      name: provider.name,
      providerType: provider.provider_type,
      baseUrl: provider.base_url,
      model: provider.model_name,
      apiKey,
      temperature: provider.temperature ?? undefined,
      maxTokens: provider.max_tokens ?? undefined,
      timeoutMs: provider.timeout_ms,
    }
  }

  /**
   * 将 TaskEntity 转换为 TaskInfo
   */
  toTaskInfo(task: TaskEntity): TaskInfo {
    return {
      id: task.id,
      conversationId: task.conversation_id,
      userMessageId: task.user_message_id,
      providerId: task.provider_id,
      workspaceId: task.workspace_id,
      permissionMode: task.permission_mode,
      status: task.status as TaskStatus,
      title: task.title,
      errorCode: task.error_code,
      errorMessage: task.error_message,
      roundCount: task.round_count,
      toolCallCount: task.tool_call_count,
      failureCount: task.failure_count,
      startedAt: task.started_at,
      completedAt: task.completed_at,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
    }
  }
}

/** 全局任务控制器单例 */
export const taskController = new TaskControllerImpl()

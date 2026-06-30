/**
 * Task Controller - 任务创建、状态管理、停止
 */
import { randomUUID } from 'crypto'
import { TaskRepository } from '../database/repositories/task.repository'
import { TaskStepRepository } from '../database/repositories/task-step.repository'
import { OperationLogRepository } from '../database/repositories/operation-log.repository'
import { MessageRepository } from '../database/repositories/message.repository'
import { MessageAttachmentRepository } from '../database/repositories/message-attachment.repository'
import { ConversationRepository } from '../database/repositories/conversation.repository'
import { WorkspaceRepository } from '../database/repositories/workspace.repository'
import { SettingsRepository } from '../database/repositories/settings.repository'
import type { ProviderConfig } from '../providers/model-provider'
import type {
  TaskEntity,
  TaskStatus,
  PermissionMode,
  CreateTaskRequest,
  TaskInfo,
} from '../../shared/types'
import { taskEventBus } from '../shared/event-bus'
import { normalizeAttachmentInput, readAttachmentSize } from '../services/attachment-utils'
import { MemoryService } from '../services/memory.service'
import { getProviderCapabilities } from '../providers/provider-capabilities'
import { AGENT_PROFILES, MULTI_AGENT_ENABLED_KEY, type AgentRole } from './agent-profiles'
import { AiSettingsService } from '../services/ai-settings.service'
import { SkillService, skillRepo } from '../services/skill.service'

const taskRepo = new TaskRepository()
const taskStepRepo = new TaskStepRepository()
const operationLogRepo = new OperationLogRepository()
const messageRepo = new MessageRepository()
const attachmentRepo = new MessageAttachmentRepository()
const conversationRepo = new ConversationRepository()
const workspaceRepo = new WorkspaceRepository()
const settingsRepo = new SettingsRepository()
const memoryService = new MemoryService()
const aiSettingsService = new AiSettingsService()
const skillService = new SkillService()

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
  multiAgentEnabled: boolean
  responderConfig: { providerConfig: ProviderConfig; prompt: string }
  collaboratorConfigs: Partial<Record<Exclude<AgentRole, 'implementation' | 'responder'>, { providerConfig: ProviderConfig; prompt: string }>>
  implementationPrompt: string
  collaboratorNotes: Partial<Record<Exclude<AgentRole, 'implementation' | 'responder'>, string>>
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
    const effectiveAiConfig = aiSettingsService.getEffectiveConfig(request.conversationId)
    const conversationProviderId = effectiveAiConfig.providerId ?? conversation.provider_id
    if (!conversationProviderId) {
      throw new Error('会话未关联模型服务商')
    }
    const multiAgentEnabled = (settingsRepo.get(MULTI_AGENT_ENABLED_KEY) ?? 'true') === 'true'
    const responderConfig = {
      providerConfig: await aiSettingsService.getProviderConfig(request.conversationId, 'responder'),
      prompt: this.readConfiguredPrompt('responder'),
    }
    const providerConfig = await aiSettingsService.getProviderConfig(request.conversationId, 'implementation')
    if ((request.attachments?.length ?? 0) > 0) {
      const capability = getProviderCapabilities(providerConfig.providerType, providerConfig.model)
      if (!capability.supportsMultimodal) {
        throw new Error('当前模型不支持附件输入，请切换到支持多模态的模型')
      }
    }

    const collaboratorConfigs = multiAgentEnabled
      ? await this.loadCollaboratorConfigs(request.conversationId)
      : {}

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

    const skillRefs = skillService.resolveRefs(request.content.trim())
    if (skillRefs.missing.length > 0) {
      throw new Error(`未找到 Skill：${skillRefs.missing.join('、')}`)
    }
    if (skillRefs.disabled.length > 0) {
      throw new Error(`Skill 已禁用：${skillRefs.disabled.join('、')}`)
    }
    if (skillRefs.refs.length > 3) {
      throw new Error('每轮最多引用 3 个 Skills，请减少 $skill 引用数量')
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
    if (request.attachments && request.attachments.length > 0) {
      attachmentRepo.createMany(
        request.attachments.map((attachment) => {
          const normalized = normalizeAttachmentInput(attachment)
          return {
            message_id: userMessage.id,
            conversation_id: request.conversationId,
            kind: normalized.kind,
            file_name: normalized.name,
            mime_type: normalized.mimeType ?? null,
            original_path: normalized.path,
            size_bytes: normalized.size ?? readAttachmentSize(normalized.path),
          }
        })
      )
    }
    skillRepo.createMessageRefs(userMessage.id, request.conversationId, skillRefs.refs)
    memoryService.ingestUserMessage(request.content.trim(), userMessage.id, workspaceId ?? conversation.workspace_id ?? null)

    // 自动标题
    if (conversation.title === '新对话') {
      const autoTitle = request.content.trim().slice(0, 30) + (request.content.trim().length > 30 ? '...' : '')
      conversationRepo.updateTitle(request.conversationId, autoTitle)
    }

    // 创建任务记录
    const taskId = randomUUID()
    const permissionMode = workspaceRoot ? this.getDefaultWorkspacePermissionMode(conversation.permission_mode) : 'chat'
    taskRepo.create({
      id: taskId,
      conversation_id: request.conversationId,
      user_message_id: userMessage.id,
      provider_id: providerConfig.id,
      workspace_id: workspaceId ?? null,
      permission_mode: permissionMode,
      title: request.title ?? request.content.trim().slice(0, 50),
    })
    messageRepo.updateTaskId(userMessage.id, taskId)

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
      providerId: providerConfig.id,
      workspaceId: workspaceId ?? null,
      workspaceRoot,
      workspaceName,
      workspaceRootName,
      permissionMode,
      providerConfig,
      multiAgentEnabled,
      responderConfig,
      collaboratorConfigs,
      implementationPrompt: this.readConfiguredPrompt('implementation'),
      collaboratorNotes: {},
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

  private readConfiguredProviderId(role: AgentRole): string | null {
    const profile = AGENT_PROFILES.find((item) => item.role === role)
    const raw = profile ? settingsRepo.get(profile.providerKey) : null
    const trimmed = raw?.trim() ?? ''
    return trimmed || null
  }

  private readConfiguredPrompt(role: AgentRole): string {
    const profile = AGENT_PROFILES.find((item) => item.role === role)
    if (!profile) return ''
    return (settingsRepo.get(profile.promptKey) ?? profile.defaultPrompt).trim()
  }

  private async loadCollaboratorConfigs(conversationId: string) {
    const roles: Array<Exclude<AgentRole, 'implementation' | 'responder'>> = ['research', 'memory']
    const entries = await Promise.all(
      roles.map(async (role) => {
        return [
          role,
          {
            providerConfig: await aiSettingsService.getProviderConfig(conversationId, role),
            prompt: this.readConfiguredPrompt(role),
          },
        ] as const
      })
    )

    return Object.fromEntries(entries) as Partial<
      Record<Exclude<AgentRole, 'implementation' | 'responder'>, { providerConfig: ProviderConfig; prompt: string }>
    >
  }

  private getDefaultWorkspacePermissionMode(
    conversationMode?: string | null
  ): PermissionMode {
    const allowedModes: PermissionMode[] = ['read', 'execute', 'command']
    if (conversationMode && allowedModes.includes(conversationMode as PermissionMode)) {
      return conversationMode as PermissionMode
    }

    const configured = settingsRepo.get('default_permission_mode')
    if (configured && allowedModes.includes(configured as PermissionMode)) {
      return configured as PermissionMode
    }

    return 'read'
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
   * 将 TaskEntity 转换为 TaskInfo
   */
  toTaskInfo(task: TaskEntity): TaskInfo {
    return {
      id: task.id,
      conversationId: task.conversation_id,
      userMessageId: task.user_message_id,
      assistantMessageId: task.assistant_message_id,
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

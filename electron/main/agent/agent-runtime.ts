/**
 * Agent Runtime - LangGraph 编排入口
 */
import type { PermissionMode, CreateTaskRequest } from '../../shared/types'
import { taskController, type RuntimeContext, type TaskLimits } from './task-controller'
import { taskEventBus } from '../shared/event-bus'
import { runAgentGraph } from './langgraph-orchestrator'
import {
  TaskTerminalError,
  createStreamingAssistantMessage,
  finishTask,
  registerPermissionResolver,
  rejectAllPendingPermissions,
  resolvePermission,
} from './agent-runtime-core'

export type { TaskTerminalError } from './agent-runtime-core'
export { registerPermissionResolver, resolvePermission, rejectAllPendingPermissions } from './agent-runtime-core'

/** 启动 Agent 任务输入 */
export interface StartAgentTaskInput {
  taskId: string
  conversationId: string
  userMessageId: string
  providerId: string
  workspaceId?: string | null
  permissionMode: PermissionMode
}

export async function runAgent(runtime: RuntimeContext): Promise<void> {
  const { taskId, conversationId } = runtime

  taskController.updateTaskStatus(taskId, 'running')
  taskEventBus.emit({ type: 'task:started', taskId })

  const assistantMessage = createStreamingAssistantMessage(conversationId, taskId)

  try {
    const finalState = await runAgentGraph({
      runtime,
      assistantMessageId: assistantMessage.id,
    })
    await finishTask(runtime, 'completed', finalState.assistantMessageId)
  } catch (err: any) {
    if (err instanceof TaskTerminalError) {
      await finishTask(runtime, err.status, err.assistantMessageId, err.message, {
        errorCode: err.errorCode,
        errorMessage: err.message,
      })
      return
    }

    const errorMsg = err?.message || 'Agent 运行时错误'
    await finishTask(runtime, 'failed', assistantMessage.id, errorMsg, {
      errorCode: 'AGENT_RUNTIME_ERROR',
      errorMessage: errorMsg,
    })
  }
}

export async function startAgentTask(request: CreateTaskRequest): Promise<string> {
  const { taskId, runtime } = await taskController.createTask(request)

  runAgent(runtime).catch((err) => {
    console.error('Agent runtime error:', err)
    taskController.updateTaskStatus(taskId, 'failed', {
      errorCode: 'AGENT_RUNTIME_ERROR',
      errorMessage: err?.message || 'Agent 运行时错误',
    })
    taskController.cleanup(taskId)
  })

  return taskId
}

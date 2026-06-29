/**
 * 权限审批 IPC 处理器
 */
import { ipcMain } from 'electron'
import {
  IPC_PERMISSION_DECIDE,
  IPC_PERMISSION_GET_REQUEST,
  IPC_PERMISSION_GET_BY_TASK,
} from '../../shared/ipc'
import { permissionService } from '../services/permission.service'
import { resolvePermission } from '../agent/agent-runtime'
import { handlePermissionDecision } from '../tools/tool-executor'
import type { PermissionDecision } from '../services/permission.service'

export function registerPermissionIpc(): void {
  // 用户做出权限决策
  ipcMain.handle(
    IPC_PERMISSION_DECIDE,
    async (_event, requestId: string, decision: PermissionDecision, decisionReason?: string | null) => {
      if (!requestId || typeof requestId !== 'string') {
        throw new Error('requestId 不能为空')
      }
      if (!['approved_once', 'approved_for_conversation', 'rejected'].includes(decision)) {
        throw new Error(`无效的决策类型: ${decision}`)
      }

      // 处理权限决策（更新数据库 + 推送事件）
      handlePermissionDecision(requestId, decision, decision === 'rejected' ? decisionReason : null)

      // 解除 Agent Runtime 的等待
      const approved = decision !== 'rejected'
      resolvePermission(requestId, approved)

      return { ok: true }
    }
  )

  // 获取权限请求详情
  ipcMain.handle(
    IPC_PERMISSION_GET_REQUEST,
    async (_event, requestId: string) => {
      if (!requestId) return null
      return permissionService.getRequest(requestId)
    }
  )

  // 获取任务下的权限请求列表
  ipcMain.handle(
    IPC_PERMISSION_GET_BY_TASK,
    async (_event, taskId: string) => {
      if (!taskId) return []
      return permissionService.getRequestsByTaskId(taskId)
    }
  )
}

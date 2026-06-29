/**
 * PermissionService - 权限审批服务
 * 负责权限请求创建、决策处理、任务授权检查
 */
import { randomUUID } from 'crypto'
import { PermissionRequestRepository, type PermissionRequestEntity, type CreatePermissionRequestInput } from '../database/repositories/permission-request.repository'
import { checkPermissionRequired, type PermissionCheckResult } from '../security/permission-policy'
import type { ToolRiskLevel } from '../../shared/types'

const permissionRequestRepo = new PermissionRequestRepository()

export type PermissionDecision = 'approved_once' | 'approved_for_conversation' | 'rejected'

export interface PermissionRequestInput {
  taskId: string
  toolCallId: string
  permissionType: string
  title: string
  reason?: string
  target?: string
  impactSummary?: string
  riskLevel?: ToolRiskLevel
}

class PermissionServiceImpl {
  /**
   * 检查工具调用是否需要权限审批
   */
  requiresPermission(toolName: string, input: unknown): PermissionCheckResult {
    return checkPermissionRequired(toolName, input)
  }

  /**
   * 请求权限
   * 创建 permission_request 记录
   */
  requestPermission(input: PermissionRequestInput): PermissionRequestEntity {
    const checkResult = checkPermissionRequired(input.permissionType, undefined)

    const createInput: CreatePermissionRequestInput = {
      id: randomUUID(),
      task_id: input.taskId,
      tool_call_id: input.toolCallId,
      permission_type: input.permissionType,
      title: input.title,
      reason: input.reason,
      target: input.target,
      impact_summary: input.impactSummary,
      risk_level: input.riskLevel ?? checkResult.riskLevel ?? 'medium',
    }

    return permissionRequestRepo.create(createInput)
  }

  /**
   * 处理审批决策
   */
  handleDecision(requestId: string, decision: PermissionDecision, decisionReason?: string | null): void {
    const request = permissionRequestRepo.getById(requestId)
    if (!request) {
      throw new Error(`权限请求不存在: ${requestId}`)
    }

    if (request.status !== 'pending') {
      throw new Error(`权限请求已处理: ${request.status}`)
    }

    switch (decision) {
      case 'approved_once':
        permissionRequestRepo.updateDecision(requestId, 'approved', 'once')
        break
      case 'approved_for_conversation':
        permissionRequestRepo.updateDecision(requestId, 'approved', 'conversation')
        break
      case 'rejected':
        permissionRequestRepo.updateDecision(requestId, 'rejected', undefined, decisionReason)
        break
    }
  }

  /**
   * 检查任务是否已有授权
   */
  hasConversationApproval(conversationId: string, toolName: string, target?: string): boolean {
    return permissionRequestRepo.hasConversationApproval(conversationId, toolName, target)
  }

  /**
   * 获取权限请求
   */
  getRequest(requestId: string): PermissionRequestEntity | null {
    return permissionRequestRepo.getById(requestId)
  }

  /**
   * 获取任务的待处理权限请求
   */
  getPendingRequests(taskId: string): PermissionRequestEntity[] {
    return permissionRequestRepo.getPendingByTaskId(taskId)
  }

  /**
   * 取消任务的所有待处理权限请求
   */
  cancelPendingRequests(taskId: string): void {
    permissionRequestRepo.cancelPendingByTaskId(taskId)
  }

  /**
   * 获取任务的所有权限请求
   */
  getRequestsByTaskId(taskId: string): PermissionRequestEntity[] {
    return permissionRequestRepo.getByTaskId(taskId)
  }
}

/** 全局权限服务单例 */
export const permissionService = new PermissionServiceImpl()

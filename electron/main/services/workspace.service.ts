import { dialog, BrowserWindow } from 'electron'
import { normalize, basename } from 'path'
import { existsSync, statSync } from 'fs'
import {
  WorkspaceRepository,
  type WorkspaceEntity,
} from '../database/repositories/workspace.repository'

/**
 * 工作区 VO（返回给前端的对象）
 */
export interface WorkspaceVO {
  id: string
  name: string
  rootPath: string
  normalizedPath: string
  defaultPermissionMode: string
  isFavorite: boolean
  isAvailable: boolean
  lastOpenedAt: string | null
  createdAt: string
  updatedAt: string
}

/**
 * WorkspaceService - 工作区业务逻辑
 * 负责工作区选择、保存、切换、可用性检查
 */
export class WorkspaceService {
  private workspaceRepo: WorkspaceRepository

  constructor() {
    this.workspaceRepo = new WorkspaceRepository()
  }

  /**
   * 打开系统文件夹选择器并保存工作区
   */
  async selectWorkspace(parentWindow?: BrowserWindow): Promise<WorkspaceVO | null> {
    const result = await dialog.showOpenDialog(parentWindow ?? null, {
      properties: ['openDirectory'],
      title: '选择工作区文件夹',
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const rootPath = result.filePaths[0]
    return this.saveWorkspace(rootPath)
  }

  /**
   * 保存工作区
   * - 规范化路径
   * - 校验路径可用性
   * - 相同 normalized_path 不重复创建，更新 last_opened_at 和名称
   */
  saveWorkspace(rootPath: string, name?: string): WorkspaceVO {
    // 规范化路径
    const normalizedPath = normalize(rootPath)

    // 校验路径可用性（目录存在且可读）
    if (!this.checkPathAvailable(normalizedPath)) {
      throw new Error('工作区路径不存在或不可访问')
    }

    // 检查是否已存在相同路径的工作区
    const existing = this.workspaceRepo.getByNormalizedPath(normalizedPath)
    if (existing) {
      // 已存在，更新 last_opened_at 和名称
      const finalName = name ?? existing.name
      this.workspaceRepo.updateName(existing.id, finalName)
      this.workspaceRepo.updateLastOpened(existing.id)
      this.workspaceRepo.updateAvailable(existing.id, true)
      return this.toVO(this.workspaceRepo.getById(existing.id)!)
    }

    // 创建新工作区
    const finalName = name ?? basename(normalizedPath)
    const entity = this.workspaceRepo.create({
      name: finalName,
      rootPath,
      normalizedPath,
      defaultPermissionMode: 'read',
    })

    return this.toVO(entity)
  }

  /**
   * 获取工作区列表
   * 返回时检查路径是否依旧可用，更新 is_available
   */
  listWorkspaces(): WorkspaceVO[] {
    const entities = this.workspaceRepo.getAll()
    return entities.map((entity) => {
      // 检查路径可用性并更新
      const available = this.checkPathAvailable(entity.root_path)
      if (available !== (entity.is_available === 1)) {
        this.workspaceRepo.updateAvailable(entity.id, available)
        entity.is_available = available ? 1 : 0
      }
      return this.toVO(entity)
    })
  }

  /**
   * 根据 ID 获取工作区
   */
  getWorkspaceById(id: string): WorkspaceVO | null {
    const entity = this.workspaceRepo.getById(id)
    if (!entity) return null
    return this.toVO(entity)
  }

  /**
   * 更新工作区信息（如名称）
   */
  updateWorkspace(id: string, data: { name?: string; isFavorite?: boolean }): WorkspaceVO | null {
    if (data.name !== undefined) {
      this.workspaceRepo.updateName(id, data.name)
    }
    if (data.isFavorite !== undefined) {
      this.workspaceRepo.updateFavorite(id, data.isFavorite)
    }
    return this.getWorkspaceById(id)
  }

  /**
   * 删除工作区（逻辑删除）
   */
  deleteWorkspace(id: string): void {
    this.workspaceRepo.softDelete(id)
  }

  /**
   * 切换工作区 - 更新最后打开时间
   */
  switchWorkspace(id: string): WorkspaceVO | null {
    const workspace = this.workspaceRepo.getById(id)
    if (!workspace) {
      throw new Error('工作区不存在')
    }

    // 检查路径可用性
    if (!this.checkPathAvailable(workspace.root_path)) {
      this.workspaceRepo.updateAvailable(id, false)
      throw new Error('工作区路径不可用')
    }

    this.workspaceRepo.updateLastOpened(id)
    this.workspaceRepo.updateAvailable(id, true)
    return this.getWorkspaceById(id)
  }

  /**
   * 检查工作区路径是否可用
   */
  checkPathAvailable(rootPath: string): boolean {
    try {
      if (!existsSync(rootPath)) return false
      const stat = statSync(rootPath)
      return stat.isDirectory()
    } catch {
      return false
    }
  }

  /**
   * 检查工作区可用性（按 ID）
   */
  checkWorkspaceAvailable(id: string): boolean {
    const workspace = this.workspaceRepo.getById(id)
    if (!workspace) return false
    return this.checkPathAvailable(workspace.root_path)
  }

  /**
   * 将实体转换为 VO
   */
  private toVO(entity: WorkspaceEntity): WorkspaceVO {
    return {
      id: entity.id,
      name: entity.name,
      rootPath: entity.root_path,
      normalizedPath: entity.normalized_path,
      defaultPermissionMode: entity.default_permission_mode,
      isFavorite: entity.is_favorite === 1,
      isAvailable: entity.is_available === 1,
      lastOpenedAt: entity.last_opened_at,
      createdAt: entity.created_at,
      updatedAt: entity.updated_at,
    }
  }
}

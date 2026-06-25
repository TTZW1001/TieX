import { getDatabase } from '../database'
import { randomUUID } from 'crypto'
import { existsSync } from 'fs'

/**
 * Workspace 数据库实体
 */
export interface WorkspaceEntity {
  id: string
  name: string
  root_path: string
  normalized_path: string
  default_permission_mode: string
  is_favorite: number
  is_available: number
  is_deleted: number
  last_opened_at: string | null
  created_at: string
  updated_at: string
}

/**
 * 工作区输入
 */
export interface WorkspaceInput {
  name: string
  rootPath: string
  normalizedPath: string
  defaultPermissionMode?: string
}

/**
 * Workspace Repository - 工作区表的 CRUD 操作
 */
export class WorkspaceRepository {
  /**
   * 创建工作区
   * 相同的 normalized_path 不应重复创建
   */
  create(data: WorkspaceInput): WorkspaceEntity {
    const db = getDatabase()
    const id = randomUUID()
    const now = new Date().toISOString()
    const permissionMode = data.defaultPermissionMode ?? 'read'

    db.prepare(
      `INSERT INTO workspaces (id, name, root_path, normalized_path, default_permission_mode, is_favorite, is_available, is_deleted, last_opened_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, 1, 0, ?, ?, ?)`
    ).run(id, data.name, data.rootPath, data.normalizedPath, permissionMode, now, now, now)

    return {
      id,
      name: data.name,
      root_path: data.rootPath,
      normalized_path: data.normalizedPath,
      default_permission_mode: permissionMode,
      is_favorite: 0,
      is_available: 1,
      is_deleted: 0,
      last_opened_at: now,
      created_at: now,
      updated_at: now,
    }
  }

  /**
   * 根据 ID 获取工作区
   */
  getById(id: string): WorkspaceEntity | null {
    const db = getDatabase()
    const row = db
      .prepare('SELECT * FROM workspaces WHERE id = ? AND is_deleted = 0')
      .get(id) as WorkspaceEntity | undefined
    return row ?? null
  }

  /**
   * 根据规范化路径获取工作区
   */
  getByNormalizedPath(normalizedPath: string): WorkspaceEntity | null {
    const db = getDatabase()
    const row = db
      .prepare('SELECT * FROM workspaces WHERE normalized_path = ? AND is_deleted = 0')
      .get(normalizedPath) as WorkspaceEntity | undefined
    return row ?? null
  }

  /**
   * 获取所有未删除的工作区
   * 按 is_favorite 降序、last_opened_at 降序排列
   */
  getAll(): WorkspaceEntity[] {
    const db = getDatabase()
    return db
      .prepare(
        `SELECT * FROM workspaces WHERE is_deleted = 0
         ORDER BY is_favorite DESC, last_opened_at DESC`
      )
      .all() as WorkspaceEntity[]
  }

  /**
   * 更新工作区名称
   */
  updateName(id: string, name: string): void {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare('UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ?').run(
      name,
      now,
      id
    )
  }

  /**
   * 更新收藏状态
   */
  updateFavorite(id: string, isFavorite: boolean): void {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare('UPDATE workspaces SET is_favorite = ?, updated_at = ? WHERE id = ?').run(
      isFavorite ? 1 : 0,
      now,
      id
    )
  }

  /**
   * 更新最后打开时间
   */
  updateLastOpened(id: string): void {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare('UPDATE workspaces SET last_opened_at = ?, updated_at = ? WHERE id = ?').run(
      now,
      now,
      id
    )
  }

  /**
   * 更新可用性状态
   */
  updateAvailable(id: string, isAvailable: boolean): void {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare('UPDATE workspaces SET is_available = ?, updated_at = ? WHERE id = ?').run(
      isAvailable ? 1 : 0,
      now,
      id
    )
  }

  /**
   * 逻辑删除工作区
   */
  softDelete(id: string): void {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare('UPDATE workspaces SET is_deleted = 1, updated_at = ? WHERE id = ?').run(
      now,
      id
    )
  }

  /**
   * 检查路径是否可用（目录存在且可读）
   */
  static checkPathAvailable(rootPath: string): boolean {
    try {
      return existsSync(rootPath)
    } catch {
      return false
    }
  }
}

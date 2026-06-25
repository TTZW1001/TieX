/**
 * BackupService - 文件备份服务
 * 负责备份目录管理、备份创建和恢复
 */
import { app } from 'electron'
import { join, dirname, relative } from 'path'
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, unlinkSync, renameSync } from 'fs'
import { createHash } from 'crypto'

/** 备份根目录 */
function getBackupRoot(): string {
  return join(app.getPath('userData'), 'backups')
}

/** 任务备份目录 */
function getTaskBackupDir(taskId: string): string {
  return join(getBackupRoot(), taskId)
}

/**
 * 计算文件 SHA256 哈希
 */
export function computeFileHash(filePath: string): string {
  const content = readFileSync(filePath)
  return createHash('sha256').update(content).digest('hex')
}

/**
 * 计算内容 SHA256 哈希
 */
export function computeContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

/**
 * 原子写入文件：先写入临时文件，再重命名替换
 */
export function atomicWriteFile(filePath: string, content: string): void {
  const tmpPath = filePath + '.tiex.tmp'
  try {
    // 确保父目录存在
    const dir = dirname(filePath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    // 写入临时文件
    writeFileSync(tmpPath, content, 'utf-8')

    // 原子替换
    renameSync(tmpPath, filePath)
  } catch (err) {
    // 清理临时文件
    try {
      if (existsSync(tmpPath)) {
        unlinkSync(tmpPath)
      }
    } catch {}
    throw err
  }
}

export class BackupService {
  /**
   * 创建文件备份，返回备份路径
   */
  createBackup(taskId: string, workspaceRoot: string, relativePath: string): string {
    const sourcePath = join(workspaceRoot, relativePath)

    if (!existsSync(sourcePath)) {
      throw new Error(`源文件不存在: ${relativePath}`)
    }

    // 备份目录保持相对目录结构
    const backupDir = getTaskBackupDir(taskId)
    const backupFilePath = join(backupDir, relativePath)
    const backupFileDir = dirname(backupFilePath)

    // 确保备份目录存在
    if (!existsSync(backupFileDir)) {
      mkdirSync(backupFileDir, { recursive: true })
    }

    // 复制文件到备份目录
    copyFileSync(sourcePath, backupFilePath)

    return backupFilePath
  }

  /**
   * 从备份恢复文件
   * 返回是否成功恢复
   */
  restoreFile(
    taskId: string,
    workspaceRoot: string,
    relativePath: string,
    expectedAfterHash?: string
  ): { success: boolean; conflict?: boolean; message?: string } {
    const backupDir = getTaskBackupDir(taskId)
    const backupFilePath = join(backupDir, relativePath)
    const targetPath = join(workspaceRoot, relativePath)

    // 检查备份文件是否存在
    if (!existsSync(backupFilePath)) {
      return { success: false, message: '备份文件不存在' }
    }

    // 如果提供了预期哈希，检查当前文件是否已被修改
    if (expectedAfterHash && existsSync(targetPath)) {
      const currentHash = computeFileHash(targetPath)
      if (currentHash !== expectedAfterHash) {
        return { success: false, conflict: true, message: '文件在修改后又被更改，存在冲突' }
      }
    }

    // 确保目标目录存在
    const targetDir = dirname(targetPath)
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true })
    }

    // 恢复文件
    copyFileSync(backupFilePath, targetPath)

    return { success: true }
  }

  /**
   * 清理任务的所有备份
   */
  cleanupTaskBackups(taskId: string): void {
    const backupDir = getTaskBackupDir(taskId)
    if (existsSync(backupDir)) {
      try {
        const { rmSync } = require('fs')
        rmSync(backupDir, { recursive: true, force: true })
      } catch (err) {
        console.error(`Failed to cleanup backups for task ${taskId}:`, err)
      }
    }
  }

  /**
   * 获取备份文件路径（不执行操作）
   */
  getBackupPath(taskId: string, relativePath: string): string {
    return join(getTaskBackupDir(taskId), relativePath)
  }

  /**
   * 检查备份是否存在
   */
  backupExists(taskId: string, relativePath: string): boolean {
    const backupPath = this.getBackupPath(taskId, relativePath)
    return existsSync(backupPath)
  }
}

/** 全局备份服务单例 */
export const backupService = new BackupService()

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { computeFileHash, computeContentHash } from '@electron/main/services/backup.service'
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'

// Mock Electron app
vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => join(tmpdir(), `tiex-test-mock-${name}`),
  },
}))

// 动态导入以使用 mock
const { BackupService } = await import('@electron/main/services/backup.service')

let testDir: string
let workspaceRoot: string
let backupService: InstanceType<typeof BackupService>

beforeEach(() => {
  testDir = join(tmpdir(), `tiex-test-backup-${Date.now()}`)
  workspaceRoot = join(testDir, 'workspace')
  mkdirSync(workspaceRoot, { recursive: true })
  backupService = new BackupService()
})

afterEach(() => {
  try {
    rmSync(testDir, { recursive: true, force: true })
  } catch {}
})

describe('BackupService', () => {
  describe('备份创建成功', () => {
    it('应成功创建文件备份', () => {
      writeFileSync(join(workspaceRoot, 'test.txt'), 'original content')
      const taskId = 'task-001'

      const backupPath = backupService.createBackup(taskId, workspaceRoot, 'test.txt')
      expect(backupPath).toBeTruthy()
      expect(existsSync(backupPath)).toBe(true)
    })

    it('备份内容应与源文件一致', () => {
      const content = 'original content for verification'
      writeFileSync(join(workspaceRoot, 'test.txt'), content)
      const taskId = 'task-002'

      const backupPath = backupService.createBackup(taskId, workspaceRoot, 'test.txt')
      const backupContent = readFileSync(backupPath, 'utf-8')
      expect(backupContent).toBe(content)
    })
  })

  describe('备份目录结构正确', () => {
    it('子目录文件应保持相对路径结构', () => {
      mkdirSync(join(workspaceRoot, 'src'), { recursive: true })
      writeFileSync(join(workspaceRoot, 'src', 'index.ts'), 'console.log("hello")')
      const taskId = 'task-003'

      const backupPath = backupService.createBackup(taskId, workspaceRoot, 'src/index.ts')
      expect(backupPath).toContain('src')
      expect(backupPath).toContain('index.ts')
    })
  })

  describe('文件恢复成功', () => {
    it('应成功从备份恢复文件', () => {
      writeFileSync(join(workspaceRoot, 'test.txt'), 'original')
      const taskId = 'task-004'

      backupService.createBackup(taskId, workspaceRoot, 'test.txt')

      // 修改文件
      writeFileSync(join(workspaceRoot, 'test.txt'), 'modified')

      // 恢复
      const result = backupService.restoreFile(taskId, workspaceRoot, 'test.txt')
      expect(result.success).toBe(true)

      const restoredContent = readFileSync(join(workspaceRoot, 'test.txt'), 'utf-8')
      expect(restoredContent).toBe('original')
    })
  })

  describe('冲突检测', () => {
    it('哈希不一致时应拒绝恢复', () => {
      writeFileSync(join(workspaceRoot, 'test.txt'), 'original')
      const taskId = 'task-005'

      backupService.createBackup(taskId, workspaceRoot, 'test.txt')

      // 修改文件
      writeFileSync(join(workspaceRoot, 'test.txt'), 'modified')

      // 计算修改后的哈希
      const afterHash = computeFileHash(join(workspaceRoot, 'test.txt'))

      // 再次修改文件
      writeFileSync(join(workspaceRoot, 'test.txt'), 'modified again')

      // 尝试用旧的哈希恢复，应该冲突
      const result = backupService.restoreFile(taskId, workspaceRoot, 'test.txt', afterHash)
      expect(result.success).toBe(false)
      expect(result.conflict).toBe(true)
    })
  })

  describe('不存在的备份返回错误', () => {
    it('恢复不存在的备份应返回失败', () => {
      const result = backupService.restoreFile('nonexistent-task', workspaceRoot, 'nonexistent.txt')
      expect(result.success).toBe(false)
      expect(result.message).toBeTruthy()
    })
  })

  describe('computeFileHash', () => {
    it('相同内容应产生相同哈希', () => {
      writeFileSync(join(workspaceRoot, 'a.txt'), 'same content')
      writeFileSync(join(workspaceRoot, 'b.txt'), 'same content')

      const hashA = computeFileHash(join(workspaceRoot, 'a.txt'))
      const hashB = computeFileHash(join(workspaceRoot, 'b.txt'))
      expect(hashA).toBe(hashB)
    })

    it('不同内容应产生不同哈希', () => {
      writeFileSync(join(workspaceRoot, 'a.txt'), 'content A')
      writeFileSync(join(workspaceRoot, 'b.txt'), 'content B')

      const hashA = computeFileHash(join(workspaceRoot, 'a.txt'))
      const hashB = computeFileHash(join(workspaceRoot, 'b.txt'))
      expect(hashA).not.toBe(hashB)
    })
  })

  describe('computeContentHash', () => {
    it('应正确计算内容哈希', () => {
      const hash = computeContentHash('test content')
      expect(hash).toBeTruthy()
      expect(typeof hash).toBe('string')
      expect(hash.length).toBe(64) // SHA256 hex
    })
  })

  describe('backupExists', () => {
    it('备份存在时应返回 true', () => {
      writeFileSync(join(workspaceRoot, 'test.txt'), 'content')
      const taskId = 'task-006'
      backupService.createBackup(taskId, workspaceRoot, 'test.txt')
      expect(backupService.backupExists(taskId, 'test.txt')).toBe(true)
    })

    it('备份不存在时应返回 false', () => {
      expect(backupService.backupExists('nonexistent', 'test.txt')).toBe(false)
    })
  })
})

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PathGuard } from '@electron/main/security/path-guard'
import { mkdirSync, writeFileSync, rmSync, symlinkSync, existsSync, mkdir } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'

const pathGuard = new PathGuard()

let workspaceRoot: string
let testDir: string

beforeEach(() => {
  testDir = join(tmpdir(), `tiex-test-pg-${Date.now()}`)
  workspaceRoot = join(testDir, 'workspace')
  mkdirSync(workspaceRoot, { recursive: true })
  // 创建一些测试文件
  writeFileSync(join(workspaceRoot, 'test.txt'), 'hello')
  mkdirSync(join(workspaceRoot, 'subdir'), { recursive: true })
  writeFileSync(join(workspaceRoot, 'subdir', 'file.ts'), 'content')
})

afterEach(() => {
  try {
    rmSync(testDir, { recursive: true, force: true })
  } catch {}
})

describe('PathGuard', () => {
  describe('工作区内路径通过验证', () => {
    it('应允许工作区内的简单文件路径', () => {
      const result = pathGuard.validate(workspaceRoot, 'test.txt')
      expect(result.allowed).toBe(true)
      expect(result.resolvedPath).toBe(resolve(workspaceRoot, 'test.txt'))
    })

    it('应允许工作区内的子目录路径', () => {
      const result = pathGuard.validate(workspaceRoot, 'subdir/file.ts')
      expect(result.allowed).toBe(true)
      expect(result.resolvedPath).toBe(resolve(workspaceRoot, 'subdir', 'file.ts'))
    })

    it('应允许工作区内的目录路径', () => {
      const result = pathGuard.validate(workspaceRoot, 'subdir')
      expect(result.allowed).toBe(true)
    })
  })

  describe('工作区外路径被拒绝', () => {
    it('应拒绝指向工作区外的路径', () => {
      const result = pathGuard.validate(workspaceRoot, '../../etc/passwd')
      expect(result.allowed).toBe(false)
    })
  })

  describe('路径穿越被拒绝', () => {
    it('应拒绝包含 .. 的路径', () => {
      const result = pathGuard.validate(workspaceRoot, '../outside.txt')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('..')
    })

    it('应拒绝深层路径穿越', () => {
      const result = pathGuard.validate(workspaceRoot, 'subdir/../../outside.txt')
      expect(result.allowed).toBe(false)
    })
  })

  describe('绝对路径注入被拒绝', () => {
    it('应拒绝绝对路径（Windows 盘符）', () => {
      const result = pathGuard.validate(workspaceRoot, 'C:\\Windows\\System32')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('绝对路径')
    })

    it('应拒绝 Unix 绝对路径', () => {
      const result = pathGuard.validate(workspaceRoot, '/etc/passwd')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('绝对路径')
    })
  })

  describe('UNC 路径被拒绝', () => {
    it('应拒绝 UNC 路径（\\\\server\\share）', () => {
      const result = pathGuard.validate(workspaceRoot, '\\\\server\\share')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('UNC')
    })

    it('应拒绝 // 开头的路径', () => {
      const result = pathGuard.validate(workspaceRoot, '//server/share')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('UNC')
    })
  })

  describe('空路径被拒绝', () => {
    it('应拒绝空字符串路径', () => {
      const result = pathGuard.validate(workspaceRoot, '')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('空')
    })

    it('应拒绝纯空格路径', () => {
      const result = pathGuard.validate(workspaceRoot, '   ')
      expect(result.allowed).toBe(false)
    })
  })

  describe('符号链接解析正确', () => {
    it('应拒绝指向工作区外的符号链接', () => {
      const outsideDir = join(testDir, 'outside')
      mkdirSync(outsideDir, { recursive: true })
      writeFileSync(join(outsideDir, 'secret.txt'), 'secret')

      const linkPath = join(workspaceRoot, 'link')
      try {
        symlinkSync(outsideDir, linkPath, 'junction')
      } catch {
        // Windows 可能需要管理员权限创建符号链接，跳过
        return
      }

      const result = pathGuard.validate(workspaceRoot, 'link/secret.txt')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('符号链接')
    })
  })

  describe('isWithinWorkspace', () => {
    it('工作区内的路径应返回 true', () => {
      expect(pathGuard.isWithinWorkspace(workspaceRoot, resolve(workspaceRoot, 'test.txt'))).toBe(true)
    })

    it('工作区外的路径应返回 false', () => {
      expect(pathGuard.isWithinWorkspace(workspaceRoot, resolve(testDir, 'outside.txt'))).toBe(false)
    })

    it('工作区根目录本身应返回 true', () => {
      expect(pathGuard.isWithinWorkspace(workspaceRoot, workspaceRoot)).toBe(true)
    })
  })

  describe('isReadableFile', () => {
    it('应允许 .ts 文件', () => {
      expect(pathGuard.isReadableFile('test.ts')).toBe(true)
    })

    it('应允许 .json 文件', () => {
      expect(pathGuard.isReadableFile('package.json')).toBe(true)
    })

    it('应拒绝 .exe 文件', () => {
      expect(pathGuard.isReadableFile('app.exe')).toBe(false)
    })

    it('应允许 .gitignore 文件', () => {
      expect(pathGuard.isReadableFile('.gitignore')).toBe(true)
    })
  })

  describe('isWithinSizeLimit', () => {
    it('存在的文件应返回 true（小于限制）', () => {
      expect(pathGuard.isWithinSizeLimit(join(workspaceRoot, 'test.txt'))).toBe(true)
    })

    it('不存在的文件应返回 false', () => {
      expect(pathGuard.isWithinSizeLimit(join(workspaceRoot, 'nonexistent.txt'))).toBe(false)
    })
  })
})

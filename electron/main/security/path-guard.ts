import { resolve, relative, normalize, isAbsolute, sep, win32, posix } from 'path'
import { realpathSync, existsSync, statSync } from 'fs'

/**
 * PathGuard - 工作区受限沙箱的核心安全模块
 * 负责所有文件路径的安全校验，防止路径穿越、符号链接绕过、UNC 路径等攻击
 */

/** 允许读取的文本文件扩展名白名单 */
const READABLE_EXTENSIONS = new Set([
  '.ts', '.js', '.json', '.md', '.txt', '.css', '.html', '.vue',
  '.yaml', '.yml', '.toml', '.xml', '.env', '.gitignore', '.editorconfig',
  '.py', '.java', '.rs', '.go', '.c', '.cpp', '.h', '.sql', '.sh', '.bat', '.ps1',
])

/** 默认单文件大小限制 1MB */
const DEFAULT_MAX_FILE_SIZE = 1024 * 1024

export interface PathValidationResult {
  allowed: boolean
  resolvedPath?: string
  reason?: string
}

export interface IPathGuard {
  validate(workspaceRoot: string, relativePath: string): PathValidationResult
  isWithinWorkspace(workspaceRoot: string, targetPath: string): boolean
  resolveSafePath(workspaceRoot: string, relativePath: string): string | null
  isReadableFile(filePath: string): boolean
  isWithinSizeLimit(filePath: string, maxBytes: number): boolean
}

export class PathGuard implements IPathGuard {
  /**
   * 校验相对路径是否安全
   * 返回 { allowed: true } 或 { allowed: false, reason: string }
   */
  validate(workspaceRoot: string, relativePath: string): PathValidationResult {
    // 1. 拒绝空路径和非法字符
    if (!relativePath || typeof relativePath !== 'string' || relativePath.trim() === '') {
      return { allowed: false, reason: '路径不能为空' }
    }

    // 拒绝包含 null 字符的路径
    if (relativePath.includes('\0')) {
      return { allowed: false, reason: '路径包含非法字符（null 字节）' }
    }

    // 2. 拒绝 UNC 网络路径（以 \\ 开头）
    if (relativePath.startsWith('\\\\') || relativePath.startsWith('//')) {
      return { allowed: false, reason: '不允许访问 UNC 网络路径' }
    }

    // 3. 拒绝绝对路径（以 / 或盘符开头，如 C:\）
    if (isAbsolute(relativePath)) {
      return { allowed: false, reason: '不允许使用绝对路径' }
    }
    // Windows 盘符检测，如 C:\、D:/ 以及 C:file.txt（相对于盘符当前目录）
    if (/^[a-zA-Z]:/.test(relativePath)) {
      return { allowed: false, reason: '不允许使用绝对路径' }
    }

    // 4. 拒绝包含 .. 的路径（防止路径遍历）
    const segments = relativePath.split(/[\\/]/)
    if (segments.some((seg) => seg === '..')) {
      return { allowed: false, reason: '路径包含非法的目录遍历（..）' }
    }

    // 5. 工作区根路径必须存在
    if (!existsSync(workspaceRoot)) {
      return { allowed: false, reason: '工作区根路径不存在' }
    }

    // 6. 解析为绝对路径
    const resolvedPath = resolve(workspaceRoot, relativePath)

    // 7. 检查解析后的路径是否仍在工作区内
    if (!this.isWithinWorkspace(workspaceRoot, resolvedPath)) {
      return { allowed: false, reason: '路径越出工作区范围' }
    }

    // 8. 解析符号链接，获取真实路径
    let realPath: string
    try {
      // 如果目标存在，解析其真实路径；否则解析父目录
      if (existsSync(resolvedPath)) {
        realPath = realpathSync(resolvedPath)
      } else {
        // 目标不存在时，检查父目录的真实路径
        const parentDir = resolve(resolvedPath, '..')
        if (!existsSync(parentDir)) {
          return { allowed: false, reason: '目标路径的父目录不存在' }
        }
        const realParent = realpathSync(parentDir)
        realPath = resolve(realParent, relativePath.split(/[\\/]/).pop() || '')
      }
    } catch (err) {
      return { allowed: false, reason: `无法解析路径: ${(err as Error).message}` }
    }

    // 9. 检查真实路径是否仍在工作区内（防止符号链接绕过）
    if (!this.isWithinWorkspace(workspaceRoot, realPath)) {
      return { allowed: false, reason: '符号链接指向工作区外，已被拒绝' }
    }

    return { allowed: true, resolvedPath: realPath }
  }

  /**
   * 校验路径是否在工作区内
   * 使用 path.relative 判断，如果结果以 .. 开头则在工作区外
   */
  isWithinWorkspace(workspaceRoot: string, targetPath: string): boolean {
    // 规范化两个路径
    const normalizedRoot = normalize(workspaceRoot)
    const normalizedTarget = normalize(targetPath)

    // 获取相对路径
    const rel = relative(normalizedRoot, normalizedTarget)

    // 如果相对路径为空，说明是工作区根目录本身
    if (rel === '') {
      return true
    }

    // 如果相对路径以 .. 开头，说明在工作区外
    if (rel.startsWith('..') || isAbsolute(rel)) {
      return false
    }

    return true
  }

  /**
   * 获取安全的绝对路径（校验通过后返回）
   * 校验失败返回 null
   */
  resolveSafePath(workspaceRoot: string, relativePath: string): string | null {
    const result = this.validate(workspaceRoot, relativePath)
    if (result.allowed && result.resolvedPath) {
      return result.resolvedPath
    }
    return null
  }

  /**
   * 检查文件类型是否允许读取
   * 默认只允许文本文件（白名单扩展名），二进制文件拒绝
   * 无扩展名的文件（如 .gitignore、LICENSE）按文件名判断
   */
  isReadableFile(filePath: string): boolean {
    const path = require('path')
    const ext = path.extname(filePath).toLowerCase()
    const baseName = path.basename(filePath).toLowerCase()

    // 无扩展名但属于常见文本文件
    if (ext === '') {
      const allowedNoExt = ['.gitignore', '.editorconfig', '.env', 'license', 'readme', 'makefile']
      return allowedNoExt.includes(baseName)
    }

    return READABLE_EXTENSIONS.has(ext)
  }

  /**
   * 检查文件大小是否在限制内
   */
  isWithinSizeLimit(filePath: string, maxBytes: number = DEFAULT_MAX_FILE_SIZE): boolean {
    try {
      if (!existsSync(filePath)) {
        return false
      }
      const stat = statSync(filePath)
      return stat.size <= maxBytes
    } catch {
      return false
    }
  }

  /**
   * 获取允许读取的扩展名白名单
   */
  getReadableExtensions(): Set<string> {
    return new Set(READABLE_EXTENSIONS)
  }
}

/** 默认导出单例 */
export const pathGuard = new PathGuard()

/** 默认文件大小限制 */
export const DEFAULT_MAX_SIZE = DEFAULT_MAX_FILE_SIZE

/** 默认分段读取大小 64KB */
export const DEFAULT_CHUNK_SIZE = 64 * 1024

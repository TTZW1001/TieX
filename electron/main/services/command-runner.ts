/**
 * CommandRunner - 命令执行器
 * 负责子进程创建、超时管理、输出截断、进程树终止、环境变量过滤
 */
import { spawn, ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import { platform } from 'os'
import { taskEventBus } from '../shared/event-bus'
import { CommandSessionRepository } from '../database/repositories/command-session.repository'

const commandSessionRepo = new CommandSessionRepository()

export interface RunCommandInput {
  command: string
  args: string[]
  cwd: string
  timeoutMs: number
  maxOutputChars: number
  taskId?: string
}

export interface CommandSession {
  sessionId: string
  taskId?: string
  command: string
  args: string[]
  status: 'running' | 'completed' | 'failed' | 'stopped' | 'timeout'
  exitCode: number | null
  output: string
  truncated: boolean
  startedAt: string
  completedAt: string | null
}

export interface CommandOutput {
  output: string
  truncated: boolean
  exitCode: number | null
}

/** 敏感环境变量关键词 */
const SENSITIVE_ENV_PATTERNS = [
  /KEY/i, /SECRET/i, /TOKEN/i, /PASSWORD/i, /CREDENTIAL/i,
  /PRIVATE/i, /AUTH/i, /ACCESS/i,
]

/** 必须保留的环境变量 */
const PRESERVED_ENV_VARS = new Set([
  'PATH', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA',
  'NODE_ENV', 'NODE_OPTIONS', 'NPM_CONFIG_PREFIX',
  'TEMP', 'TMP', 'SYSTEMROOT', 'COMSPEC',
  'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMDATA',
  'HOMEDRIVE', 'HOMEPATH', 'USERNAME', 'USERDOMAIN',
  'OS', 'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS',
])

/** 进程映射表 */
const processMap = new Map<string, {
  process: ChildProcess
  sessionId: string
  taskId?: string
}>()

/** 会话映射表 */
const sessionMap = new Map<string, CommandSession>()

/**
 * 过滤环境变量
 */
function filterEnv(workspaceRoot: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}

  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue

    // 保留必要变量
    if (PRESERVED_ENV_VARS.has(key.toUpperCase())) {
      env[key] = value
      continue
    }

    // 过滤敏感变量
    const isSensitive = SENSITIVE_ENV_PATTERNS.some(pattern => pattern.test(key))
    if (isSensitive) continue

    // 保留其他变量
    env[key] = value
  }

  // 注入工作区路径
  env.TIEX_WORKSPACE_ROOT = workspaceRoot

  return env
}

/**
 * 终止进程树
 */
async function killProcessTree(pid: number): Promise<void> {
  const isWindows = platform() === 'win32'

  if (isWindows) {
    // Windows: 使用 taskkill /T /F 终止进程树
    return new Promise((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        shell: false,
      })
      killer.on('close', () => resolve())
      killer.on('error', () => resolve())
    })
  } else {
    // Unix: 发送 SIGTERM，3秒后 SIGKILL
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      // 进程可能已退出
      return
    }

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try {
          process.kill(pid, 'SIGKILL')
        } catch {}
        resolve()
      }, 3000)

      // 检查进程是否已退出
      const checkInterval = setInterval(() => {
        try {
          process.kill(pid, 0) // 检查进程是否存在
        } catch {
          // 进程已退出
          clearTimeout(timer)
          clearInterval(checkInterval)
          resolve()
        }
      }, 200)

      setTimeout(() => clearInterval(checkInterval), 5000)
    })
  }
}

/**
 * 执行命令
 */
export async function runCommand(input: RunCommandInput): Promise<CommandSession> {
  const sessionId = randomUUID()
  const { command, args, cwd, timeoutMs, maxOutputChars, taskId } = input

  const session: CommandSession = {
    sessionId,
    taskId,
    command,
    args,
    status: 'running',
    exitCode: null,
    output: '',
    truncated: false,
    startedAt: new Date().toISOString(),
    completedAt: null,
  }

  sessionMap.set(sessionId, session)
  try {
    commandSessionRepo.create({
      session_id: sessionId,
      task_id: taskId ?? null,
      command,
      args,
      status: 'running',
      started_at: session.startedAt,
    })
  } catch (err) {
    console.error('[command-runner] failed to persist command session start:', err)
  }

  if (taskId) {
    taskEventBus.emit({
      type: 'command:started',
      taskId,
      sessionId,
      command,
      args,
    } as any)
  }

  return new Promise<CommandSession>((resolve) => {
    const env = filterEnv(cwd)

    // Windows 上 npm/npx 等实际是 .cmd 脚本，shell:false 无法直接执行
    // 需要在 Windows 上对这些命令启用 shell
    const isWindows = platform() === 'win32'
    const needsShell = isWindows && /^(npm|npx|pip|python)$/i.test(command)
    const childProcess = spawn(command, args, {
      cwd,
      env,
      shell: needsShell,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    processMap.set(sessionId, { process: childProcess, sessionId, taskId })

    let outputBuffer = ''
    let stderrBuffer = ''
    let truncated = false

    // 收集 stdout
    childProcess.stdout?.on('data', (data: Buffer) => {
      if (truncated) return
      const chunk = data.toString('utf-8')
      if (outputBuffer.length + chunk.length > maxOutputChars) {
        outputBuffer += chunk.slice(0, maxOutputChars - outputBuffer.length)
        truncated = true
        session.truncated = true
      } else {
        outputBuffer += chunk
      }
      session.output = outputBuffer + (stderrBuffer ? '\n[stderr]\n' + stderrBuffer : '')
      try {
        commandSessionRepo.appendOutput(sessionId, chunk, session.output, session.truncated)
      } catch (err) {
        console.error('[command-runner] failed to persist command stdout:', err)
      }

      // 推送输出事件
      if (taskId) {
        taskEventBus.emit({
          type: 'command:output',
          taskId,
          sessionId,
          output: chunk,
          stream: 'stdout',
          truncated,
        } as any)
      }
    })

    // 收集 stderr
    childProcess.stderr?.on('data', (data: Buffer) => {
      if (truncated) return
      const chunk = data.toString('utf-8')
      if (stderrBuffer.length + chunk.length > maxOutputChars) {
        stderrBuffer += chunk.slice(0, maxOutputChars - stderrBuffer.length)
        truncated = true
        session.truncated = true
      } else {
        stderrBuffer += chunk
      }
      session.output = outputBuffer + (stderrBuffer ? '\n[stderr]\n' + stderrBuffer : '')
      try {
        commandSessionRepo.appendOutput(sessionId, chunk, session.output, session.truncated)
      } catch (err) {
        console.error('[command-runner] failed to persist command stderr:', err)
      }

      // 推送输出事件
      if (taskId) {
        taskEventBus.emit({
          type: 'command:output',
          taskId,
          sessionId,
          output: chunk,
          stream: 'stderr',
          truncated,
        } as any)
      }
    })

    // 超时处理
    const timeoutTimer = setTimeout(async () => {
      session.status = 'timeout'
      session.completedAt = new Date().toISOString()
      processMap.delete(sessionId)
      try {
        commandSessionRepo.updateCompleted(
          sessionId,
          session.status,
          session.exitCode,
          session.output,
          session.truncated,
          session.completedAt
        )
      } catch (err) {
        console.error('[command-runner] failed to persist command timeout:', err)
      }

      await killProcessTree(childProcess.pid!)

      if (taskId) {
        taskEventBus.emit({
          type: 'command:timeout',
          taskId,
          sessionId,
        } as any)
      }

      resolve({ ...session })
    }, timeoutMs)

    // 进程退出
    childProcess.on('close', (code) => {
      clearTimeout(timeoutTimer)
      processMap.delete(sessionId)

      session.output = outputBuffer + (stderrBuffer ? '\n[stderr]\n' + stderrBuffer : '')
      session.exitCode = code
      session.completedAt = new Date().toISOString()

      if (session.status === 'running') {
        if (code === 0) {
          session.status = 'completed'
        } else {
          session.status = 'failed'
        }
      }
      try {
        commandSessionRepo.updateCompleted(
          sessionId,
          session.status,
          session.exitCode,
          session.output,
          session.truncated,
          session.completedAt
        )
      } catch (err) {
        console.error('[command-runner] failed to persist command completion:', err)
      }

      if (taskId) {
        if (session.status === 'completed') {
          taskEventBus.emit({
            type: 'command:completed',
            taskId,
            sessionId,
            exitCode: code,
            output: outputBuffer,
          } as any)
        } else if (session.status === 'failed') {
          taskEventBus.emit({
            type: 'command:failed',
            taskId,
            sessionId,
            error: `命令退出码: ${code}`,
          } as any)
        }
      }

      resolve({ ...session })
    })

    // 进程错误
    childProcess.on('error', (err) => {
      clearTimeout(timeoutTimer)
      processMap.delete(sessionId)

      session.status = 'failed'
      session.output = (outputBuffer + (stderrBuffer ? '\n[stderr]\n' + stderrBuffer : '')) + `\n[错误] ${err.message}`
      session.completedAt = new Date().toISOString()
      try {
        commandSessionRepo.updateCompleted(
          sessionId,
          session.status,
          session.exitCode,
          session.output,
          session.truncated,
          session.completedAt
        )
      } catch (persistErr) {
        console.error('[command-runner] failed to persist command error:', persistErr)
      }

      if (taskId) {
        taskEventBus.emit({
          type: 'command:failed',
          taskId,
          sessionId,
          error: err.message,
        } as any)
      }

      resolve({ ...session })
    })
  })
}

/**
 * 停止命令
 */
export async function stopCommand(sessionId: string): Promise<void> {
  const entry = processMap.get(sessionId)
  if (!entry) return

  const { process: childProcess, taskId } = entry
  processMap.delete(sessionId)

  const session = sessionMap.get(sessionId)
  if (session) {
    session.status = 'stopped'
    session.completedAt = new Date().toISOString()
    try {
      commandSessionRepo.updateCompleted(
        sessionId,
        session.status,
        session.exitCode,
        session.output,
        session.truncated,
        session.completedAt
      )
    } catch (err) {
      console.error('[command-runner] failed to persist command stop:', err)
    }
  }

  await killProcessTree(childProcess.pid!)

  if (taskId) {
    taskEventBus.emit({
      type: 'command:stopped',
      taskId,
      sessionId,
    } as any)
  }
}

/**
 * 获取命令输出
 */
export function getCommandOutput(sessionId: string): CommandOutput | null {
  const session = sessionMap.get(sessionId)
  if (!session) return null

  return {
    output: session.output,
    truncated: session.truncated,
    exitCode: session.exitCode,
  }
}

/**
 * 获取会话信息
 */
export function getSession(sessionId: string): CommandSession | null {
  return sessionMap.get(sessionId) ?? null
}

/**
 * 停止所有正在运行的命令
 */
export async function stopAllCommands(): Promise<void> {
  const sessionIds = Array.from(processMap.keys())
  await Promise.all(sessionIds.map((id) => stopCommand(id)))
}

/**
 * 清理会话记录
 */
export function cleanupSession(sessionId: string): void {
  sessionMap.delete(sessionId)
}

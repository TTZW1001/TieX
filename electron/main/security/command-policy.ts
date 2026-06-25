/**
 * CommandPolicy - 命令安全策略
 * 判断命令是否允许执行，识别危险命令
 */

export interface CommandCheckResult {
  allowed: boolean
  reason?: string
  riskLevel?: 'medium' | 'high' | 'blocked'
}

/** 允许的命令及其参数规则 */
const ALLOWED_COMMANDS: Record<string, {
  description: string
  allowedArgs?: string[]
  argPattern?: RegExp
  maxArgs?: number
}> = {
  npm: {
    description: 'Node.js 包管理器',
    allowedArgs: ['test', 'run', 'install', 'run-script'],
  },
  npx: {
    description: '运行本地 Node.js 工具',
    maxArgs: 5,
  },
  node: {
    description: '运行 Node.js 脚本',
    maxArgs: 5,
  },
  git: {
    description: 'Git 版本控制',
    allowedArgs: ['status', 'diff', 'log', 'branch', 'tag', 'show', 'stash'],
  },
  python: {
    description: '运行 Python 脚本',
    maxArgs: 5,
  },
  pip: {
    description: 'Python 包管理器',
    allowedArgs: ['list', 'show', 'freeze'],
  },
}

/** 禁止的命令名（黑名单） */
const BLOCKED_COMMANDS = new Set([
  'rm', 'rd', 'del', 'rmdir', 'deltree',
  'shutdown', 'restart', 'reboot',
  'reg', 'regedit', 'regedt32',
  'taskkill', 'taskmgr',
  'format', 'fdisk', 'diskpart',
  'net', 'netsh',
  'powershell', 'pwsh', 'cmd',
  'certutil', 'bitsadmin',
  'wmic', 'cscript', 'wscript',
  'mshta', 'rundll32',
  'bash', 'sh', 'zsh', 'fish',
  'chmod', 'chown', 'chgrp',
  'sudo', 'su', 'runas',
  'curl', 'wget',
  'ssh', 'scp', 'sftp',
  'telnet', 'nc', 'ncat',
])

/** 禁止的参数模式 */
const BLOCKED_ARG_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /-EncodedCommand/i, reason: '编码命令不被允许' },
  { pattern: /-Encode/i, reason: '编码参数不被允许' },
  { pattern: /base64/i, reason: 'Base64 编码参数不被允许' },
  { pattern: /-g$/, reason: '全局安装不被允许' },
  { pattern: /--global/i, reason: '全局安装不被允许' },
  { pattern: /\/s\b/i, reason: '递归删除不被允许' },
  { pattern: /\/f\b/i, reason: '强制删除不被允许' },
]

/** Shell 元字符模式 */
const SHELL_META_PATTERN = /[&|;`$<>(){}\\!]/

/** 敏感路径模式 */
const SENSITIVE_PATH_PATTERNS: RegExp[] = [
  /^[A-Z]:\\(Windows|Program Files|Program Files \(x86\)|ProgramData|System Volume Information)/i,
  /^[A-Z]:\\Users\\[^\\]+\\(AppData|ntuser)/i,
  /^\/(etc|usr|bin|sbin|root|var|sys|proc)\//i,
  /\.\./, // 路径遍历
]

/**
 * 检查命令是否允许执行
 */
export function checkCommand(command: string, args: string[], cwd: string): CommandCheckResult {
  const normalizedCmd = command.toLowerCase().replace(/\.exe$/i, '').replace(/\.cmd$/i, '').replace(/\.ps1$/i, '')

  // 1. 检查黑名单
  if (BLOCKED_COMMANDS.has(normalizedCmd)) {
    return { allowed: false, reason: `命令 "${command}" 被禁止执行`, riskLevel: 'blocked' }
  }

  // 2. 检查白名单
  const rule = ALLOWED_COMMANDS[normalizedCmd]
  if (!rule) {
    return { allowed: false, reason: `命令 "${command}" 不在允许列表中`, riskLevel: 'blocked' }
  }

  // 3. 检查参数数量
  if (rule.maxArgs !== undefined && args.length > rule.maxArgs) {
    return { allowed: false, reason: `命令 "${command}" 最多允许 ${rule.maxArgs} 个参数`, riskLevel: 'blocked' }
  }

  // 4. 检查参数中的 shell 元字符
  for (const arg of args) {
    if (SHELL_META_PATTERN.test(arg)) {
      return { allowed: false, reason: `参数包含不允许的 shell 元字符`, riskLevel: 'blocked' }
    }
  }

  // 5. 检查禁止的参数模式
  for (const arg of args) {
    for (const blocked of BLOCKED_ARG_PATTERNS) {
      if (blocked.pattern.test(arg)) {
        return { allowed: false, reason: blocked.reason, riskLevel: 'blocked' }
      }
    }
  }

  // 6. 检查特定命令的参数规则
  if (normalizedCmd === 'npm') {
    const npmResult = checkNpmArgs(args)
    if (!npmResult.allowed) return npmResult
  } else if (normalizedCmd === 'git') {
    const gitResult = checkGitArgs(args)
    if (!gitResult.allowed) return gitResult
  } else if (normalizedCmd === 'pip') {
    const pipResult = checkPipArgs(args)
    if (!pipResult.allowed) return pipResult
  }

  // 7. 检查参数中的敏感路径
  for (const arg of args) {
    if (containsSensitivePath(arg, cwd)) {
      return { allowed: false, reason: '参数包含工作区外的敏感路径', riskLevel: 'blocked' }
    }
  }

  // 8. 判断风险等级
  const riskLevel = getRiskLevel(normalizedCmd, args)
  return { allowed: true, riskLevel }
}

/**
 * 判断是否危险命令
 */
export function isDangerous(command: string, args: string[]): boolean {
  const normalizedCmd = command.toLowerCase().replace(/\.exe$/i, '')
  if (BLOCKED_COMMANDS.has(normalizedCmd)) return true

  // npm install 被认为是中等风险
  if (normalizedCmd === 'npm' && args[0] === 'install') return false

  // node/python 运行脚本视为高风险
  if (normalizedCmd === 'node' || normalizedCmd === 'python') return true

  return false
}

/** 检查 npm 参数 */
function checkNpmArgs(args: string[]): CommandCheckResult {
  if (args.length === 0) {
    return { allowed: false, reason: 'npm 需要子命令', riskLevel: 'blocked' }
  }

  const subCommand = args[0]
  const allowedSubCommands = rule_allowsSub(ALLOWED_COMMANDS.npm)

  if (!allowedSubCommands.includes(subCommand)) {
    return { allowed: false, reason: `npm ${subCommand} 不被允许`, riskLevel: 'blocked' }
  }

  // npm install 不允许 -g / --global
  if (subCommand === 'install') {
    for (const arg of args.slice(1)) {
      if (arg === '-g' || arg === '--global') {
        return { allowed: false, reason: '全局安装不被允许', riskLevel: 'blocked' }
      }
    }
  }

  // npm run 需要指定脚本名
  if ((subCommand === 'run' || subCommand === 'run-script') && args.length < 2) {
    return { allowed: false, reason: 'npm run 需要指定脚本名', riskLevel: 'blocked' }
  }

  return { allowed: true }
}

/** 检查 git 参数 */
function checkGitArgs(args: string[]): CommandCheckResult {
  if (args.length === 0) {
    return { allowed: false, reason: 'git 需要子命令', riskLevel: 'blocked' }
  }

  const subCommand = args[0]
  const allowedSubCommands = rule_allowsSub(ALLOWED_COMMANDS.git)

  if (!allowedSubCommands.includes(subCommand)) {
    return { allowed: false, reason: `git ${subCommand} 不被允许`, riskLevel: 'blocked' }
  }

  // git log 限制参数
  if (subCommand === 'log') {
    for (const arg of args.slice(1)) {
      // 允许 --oneline, -n, 数字
      if (arg === '--oneline' || arg.startsWith('-n') || /^-\d+$/.test(arg)) continue
      if (arg.startsWith('--format') || arg.startsWith('--pretty')) continue
      // 其他参数可能带来风险
    }
  }

  return { allowed: true }
}

/** 检查 pip 参数 */
function checkPipArgs(args: string[]): CommandCheckResult {
  if (args.length === 0) {
    return { allowed: false, reason: 'pip 需要子命令', riskLevel: 'blocked' }
  }

  const subCommand = args[0]
  const allowedSubCommands = rule_allowsSub(ALLOWED_COMMANDS.pip)

  if (!allowedSubCommands.includes(subCommand)) {
    return { allowed: false, reason: `pip ${subCommand} 不被允许`, riskLevel: 'blocked' }
  }

  return { allowed: true }
}

/** 从规则中提取允许的子命令 */
function rule_allowsSub(rule: { allowedArgs?: string[] }): string[] {
  return rule.allowedArgs ?? []
}

/** 检查参数是否包含敏感路径 */
function containsSensitivePath(arg: string, cwd: string): string | false {
  // 检查是否是绝对路径
  if (/^[A-Z]:\\/i.test(arg) || /^\//.test(arg) || /^\\\\/.test(arg)) {
    // 检查是否在工作区内
    const normalizedArg = arg.replace(/\\/g, '/').toLowerCase()
    const normalizedCwd = cwd.replace(/\\/g, '/').toLowerCase()
    if (!normalizedArg.startsWith(normalizedCwd)) {
      // 检查是否是敏感路径
      for (const pattern of SENSITIVE_PATH_PATTERNS) {
        if (pattern.test(arg)) return arg
      }
      // 不在工作区内的绝对路径
      return arg
    }
  }

  // 检查路径遍历
  if (arg.includes('..')) {
    return arg
  }

  return false
}

/** 获取风险等级 */
function getRiskLevel(cmd: string, args: string[]): 'medium' | 'high' {
  // node/python 执行脚本为 high
  if (cmd === 'node' || cmd === 'python') return 'high'

  // npm install 为 medium
  if (cmd === 'npm' && args[0] === 'install') return 'medium'

  // npm run/test/lint 为 medium
  if (cmd === 'npm' && ['run', 'test', 'run-script', 'lint'].includes(args[0])) return 'medium'

  // git 为 medium
  if (cmd === 'git') return 'medium'

  // npx 为 medium
  if (cmd === 'npx') return 'medium'

  // pip 只读操作为 medium
  if (cmd === 'pip') return 'medium'

  // 默认为 high
  return 'high'
}

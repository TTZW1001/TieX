import { describe, it, expect } from 'vitest'
import { checkCommand, isDangerous } from '@electron/main/security/command-policy'

const CWD = 'C:\\Users\\dev\\project'

describe('CommandPolicy', () => {
  describe('白名单命令通过检查', () => {
    it('npm test 应通过', () => {
      const result = checkCommand('npm', ['test'], CWD)
      expect(result.allowed).toBe(true)
      expect(result.riskLevel).toBe('medium')
    })

    it('npm run build 应通过', () => {
      const result = checkCommand('npm', ['run', 'build'], CWD)
      expect(result.allowed).toBe(true)
    })

    it('npm install 应通过', () => {
      const result = checkCommand('npm', ['install'], CWD)
      expect(result.allowed).toBe(true)
    })

    it('git status 应通过', () => {
      const result = checkCommand('git', ['status'], CWD)
      expect(result.allowed).toBe(true)
      expect(result.riskLevel).toBe('medium')
    })

    it('git diff 应通过', () => {
      const result = checkCommand('git', ['diff'], CWD)
      expect(result.allowed).toBe(true)
    })

    it('git log 应通过', () => {
      const result = checkCommand('git', ['log'], CWD)
      expect(result.allowed).toBe(true)
    })

    it('git branch 应通过', () => {
      const result = checkCommand('git', ['branch'], CWD)
      expect(result.allowed).toBe(true)
    })

    it('node 脚本应通过', () => {
      const result = checkCommand('node', ['script.js'], CWD)
      expect(result.allowed).toBe(true)
      expect(result.riskLevel).toBe('high')
    })

    it('python 脚本应通过', () => {
      const result = checkCommand('python', ['main.py'], CWD)
      expect(result.allowed).toBe(true)
      expect(result.riskLevel).toBe('high')
    })

    it('npx 命令应通过', () => {
      const result = checkCommand('npx', ['eslint'], CWD)
      expect(result.allowed).toBe(true)
    })

    it('pip list 应通过', () => {
      const result = checkCommand('pip', ['list'], CWD)
      expect(result.allowed).toBe(true)
    })
  })

  describe('黑名单命令被拒绝', () => {
    it('rm 应被拒绝', () => {
      const result = checkCommand('rm', [], CWD)
      expect(result.allowed).toBe(false)
      expect(result.riskLevel).toBe('blocked')
    })

    it('shutdown 应被拒绝', () => {
      const result = checkCommand('shutdown', [], CWD)
      expect(result.allowed).toBe(false)
      expect(result.riskLevel).toBe('blocked')
    })

    it('powershell 应被拒绝', () => {
      const result = checkCommand('powershell', [], CWD)
      expect(result.allowed).toBe(false)
      expect(result.riskLevel).toBe('blocked')
    })

    it('curl 应被拒绝', () => {
      const result = checkCommand('curl', [], CWD)
      expect(result.allowed).toBe(false)
      expect(result.riskLevel).toBe('blocked')
    })

    it('format 应被拒绝', () => {
      const result = checkCommand('format', [], CWD)
      expect(result.allowed).toBe(false)
    })
  })

  describe('含 shell 元字符的参数被拒绝', () => {
    it('参数包含 && 应被拒绝', () => {
      const result = checkCommand('npm', ['run', 'build&&rm'], CWD)
      expect(result.allowed).toBe(false)
      expect(result.riskLevel).toBe('blocked')
    })

    it('参数包含 | 应被拒绝', () => {
      const result = checkCommand('npm', ['run', 'test|cat'], CWD)
      expect(result.allowed).toBe(false)
    })

    it('参数包含 ; 应被拒绝', () => {
      const result = checkCommand('npm', ['run', 'test;rm'], CWD)
      expect(result.allowed).toBe(false)
    })

    it('参数包含 > 应被拒绝', () => {
      const result = checkCommand('npm', ['run', 'test>out'], CWD)
      expect(result.allowed).toBe(false)
    })
  })

  describe('工作区外路径参数被拒绝', () => {
    it('参数包含 .. 应被拒绝', () => {
      const result = checkCommand('node', ['../escape.js'], CWD)
      expect(result.allowed).toBe(false)
    })

    it('参数包含工作区外的绝对路径应被拒绝', () => {
      const result = checkCommand('node', ['C:\\Windows\\evil.js'], CWD)
      expect(result.allowed).toBe(false)
    })
  })

  describe('风险等级评估正确', () => {
    it('npm run build 应为 medium', () => {
      const result = checkCommand('npm', ['run', 'build'], CWD)
      expect(result.riskLevel).toBe('medium')
    })

    it('npm install 应为 medium', () => {
      const result = checkCommand('npm', ['install'], CWD)
      expect(result.riskLevel).toBe('medium')
    })

    it('node 脚本应为 high', () => {
      const result = checkCommand('node', ['script.js'], CWD)
      expect(result.riskLevel).toBe('high')
    })

    it('python 脚本应为 high', () => {
      const result = checkCommand('python', ['script.py'], CWD)
      expect(result.riskLevel).toBe('high')
    })

    it('黑名单命令应为 blocked', () => {
      const result = checkCommand('rm', ['-rf'], CWD)
      expect(result.riskLevel).toBe('blocked')
    })

    it('不在白名单的命令应为 blocked', () => {
      const result = checkCommand('unknown', [], CWD)
      expect(result.riskLevel).toBe('blocked')
    })
  })

  describe('npm 允许的子命令', () => {
    it('npm test 应通过', () => {
      expect(checkCommand('npm', ['test'], CWD).allowed).toBe(true)
    })

    it('npm run 应通过', () => {
      expect(checkCommand('npm', ['run', 'dev'], CWD).allowed).toBe(true)
    })

    it('npm install 应通过', () => {
      expect(checkCommand('npm', ['install'], CWD).allowed).toBe(true)
    })

    it('npm publish 应被拒绝', () => {
      expect(checkCommand('npm', ['publish'], CWD).allowed).toBe(false)
    })

    it('npm 无子命令应被拒绝', () => {
      expect(checkCommand('npm', [], CWD).allowed).toBe(false)
    })

    it('npm install -g 应被拒绝', () => {
      expect(checkCommand('npm', ['install', '-g'], CWD).allowed).toBe(false)
    })

    it('npm install --global 应被拒绝', () => {
      expect(checkCommand('npm', ['install', '--global'], CWD).allowed).toBe(false)
    })

    it('npm run 无脚本名应被拒绝', () => {
      expect(checkCommand('npm', ['run'], CWD).allowed).toBe(false)
    })
  })

  describe('git 允许的子命令', () => {
    it('git status 应通过', () => {
      expect(checkCommand('git', ['status'], CWD).allowed).toBe(true)
    })

    it('git diff 应通过', () => {
      expect(checkCommand('git', ['diff'], CWD).allowed).toBe(true)
    })

    it('git log 应通过', () => {
      expect(checkCommand('git', ['log'], CWD).allowed).toBe(true)
    })

    it('git branch 应通过', () => {
      expect(checkCommand('git', ['branch'], CWD).allowed).toBe(true)
    })

    it('git push 应被拒绝', () => {
      expect(checkCommand('git', ['push'], CWD).allowed).toBe(false)
    })

    it('git reset 应被拒绝', () => {
      expect(checkCommand('git', ['reset'], CWD).allowed).toBe(false)
    })

    it('git 无子命令应被拒绝', () => {
      expect(checkCommand('git', [], CWD).allowed).toBe(false)
    })
  })

  describe('不允许的命令被拒绝', () => {
    it('del 应被拒绝', () => {
      expect(checkCommand('del', [], CWD).allowed).toBe(false)
    })

    it('regedit 应被拒绝', () => {
      expect(checkCommand('regedit', [], CWD).allowed).toBe(false)
    })

    it('ssh 应被拒绝', () => {
      expect(checkCommand('ssh', [], CWD).allowed).toBe(false)
    })

    it('wget 应被拒绝', () => {
      expect(checkCommand('wget', [], CWD).allowed).toBe(false)
    })
  })

  describe('isDangerous', () => {
    it('rm 应为危险命令', () => {
      expect(isDangerous('rm', [])).toBe(true)
    })

    it('npm install 不应被标记为危险', () => {
      expect(isDangerous('npm', ['install'])).toBe(false)
    })

    it('node 应为危险命令', () => {
      expect(isDangerous('node', ['script.js'])).toBe(true)
    })

    it('python 应为危险命令', () => {
      expect(isDangerous('python', ['script.py'])).toBe(true)
    })
  })

  describe('命令名规范化', () => {
    it('npm.exe 应等同于 npm', () => {
      expect(checkCommand('npm.exe', ['test'], CWD).allowed).toBe(true)
    })

    it('npm.cmd 应等同于 npm', () => {
      expect(checkCommand('npm.cmd', ['test'], CWD).allowed).toBe(true)
    })
  })
})

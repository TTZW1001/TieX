import { describe, it, expect } from 'vitest'
import { checkPermissionRequired, getToolRiskLevel } from '@electron/main/security/permission-policy'

describe('PermissionPolicy', () => {
  describe('只读工具默认低风险', () => {
    it('list_files 应为低风险且不需要审批', () => {
      const result = checkPermissionRequired('list_files', {})
      expect(result.required).toBe(false)
      expect(result.riskLevel).toBe('low')
    })

    it('read_file 应为低风险且不需要审批', () => {
      const result = checkPermissionRequired('read_file', {})
      expect(result.required).toBe(false)
      expect(result.riskLevel).toBe('low')
    })

    it('search_files 应为低风险且不需要审批', () => {
      const result = checkPermissionRequired('search_files', {})
      expect(result.required).toBe(false)
      expect(result.riskLevel).toBe('low')
    })
  })

  describe('写入工具默认高风险', () => {
    it('create_file 应需要审批', () => {
      const result = checkPermissionRequired('create_file', { path: 'test.txt', content: 'hello' })
      expect(result.required).toBe(true)
    })

    it('edit_file 应为高风险且需要审批', () => {
      const result = checkPermissionRequired('edit_file', { path: 'test.txt' })
      expect(result.required).toBe(true)
      expect(result.riskLevel).toBe('high')
    })

    it('create_markdown 应需要审批', () => {
      const result = checkPermissionRequired('create_markdown', { name: 'doc.md' })
      expect(result.required).toBe(true)
    })

    it('create_docx 应需要审批', () => {
      const result = checkPermissionRequired('create_docx', { name: 'doc.docx' })
      expect(result.required).toBe(true)
    })

    it('create_pptx 应需要审批', () => {
      const result = checkPermissionRequired('create_pptx', { name: 'slides.pptx' })
      expect(result.required).toBe(true)
    })
  })

  describe('run_command 命令审批规则', () => {
    it('npm run build 应为 medium 风险', () => {
      const result = checkPermissionRequired('run_command', { command: 'npm', args: ['run', 'build'] })
      expect(result.required).toBe(true)
      expect(result.riskLevel).toBe('medium')
    })

    it('npm run test 应为 medium 风险', () => {
      const result = checkPermissionRequired('run_command', { command: 'npm', args: ['run', 'test'] })
      expect(result.required).toBe(true)
      expect(result.riskLevel).toBe('medium')
    })

    it('npm 命令应为 medium 风险', () => {
      const result = checkPermissionRequired('run_command', { command: 'npm', args: ['install'] })
      expect(result.required).toBe(true)
      expect(result.riskLevel).toBe('medium')
    })

    it('git 命令应为 medium 风险', () => {
      const result = checkPermissionRequired('run_command', { command: 'git', args: ['status'] })
      expect(result.required).toBe(true)
      expect(result.riskLevel).toBe('medium')
    })

    it('其他命令应为 high 风险', () => {
      const result = checkPermissionRequired('run_command', { command: 'node', args: ['script.js'] })
      expect(result.required).toBe(true)
      expect(result.riskLevel).toBe('high')
    })
  })

  describe('文件覆盖场景触发审批', () => {
    it('create_file overwrite=true 应为 high 风险', () => {
      const result = checkPermissionRequired('create_file', { path: 'test.txt', content: 'hello', overwrite: true })
      expect(result.required).toBe(true)
      expect(result.riskLevel).toBe('high')
      expect(result.reason).toContain('覆盖')
    })

    it('create_file overwrite=false 应为 medium 风险', () => {
      const result = checkPermissionRequired('create_file', { path: 'test.txt', content: 'hello', overwrite: false })
      expect(result.required).toBe(true)
      expect(result.riskLevel).toBe('medium')
    })

    it('create_markdown overwrite=true 应为 high 风险', () => {
      const result = checkPermissionRequired('create_markdown', { name: 'doc.md', overwrite: true })
      expect(result.riskLevel).toBe('high')
    })

    it('create_docx overwrite=true 应为 high 风险', () => {
      const result = checkPermissionRequired('create_docx', { name: 'doc.docx', overwrite: true })
      expect(result.riskLevel).toBe('high')
    })

    it('create_pptx overwrite=true 应为 high 风险', () => {
      const result = checkPermissionRequired('create_pptx', { name: 'slides.pptx', overwrite: true })
      expect(result.riskLevel).toBe('high')
    })
  })

  describe('未知工具', () => {
    it('未知工具应需要审批且为 high 风险', () => {
      const result = checkPermissionRequired('unknown_tool', {})
      expect(result.required).toBe(true)
      expect(result.riskLevel).toBe('high')
    })
  })

  describe('getToolRiskLevel', () => {
    it('应返回正确的风险等级', () => {
      expect(getToolRiskLevel('list_files')).toBe('low')
      expect(getToolRiskLevel('edit_file')).toBe('high')
      expect(getToolRiskLevel('create_file', { overwrite: true })).toBe('high')
    })
  })
})

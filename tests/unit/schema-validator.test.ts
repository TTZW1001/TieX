import { describe, it, expect } from 'vitest'
import { validateToolInput, formatValidationError } from '@electron/main/security/schema-validator'
import type { JSONSchema } from '@electron/main/tools/agent-tool.types'

describe('SchemaValidator', () => {
  const simpleSchema: JSONSchema = {
    type: 'object',
    properties: {
      name: { type: 'string', description: '名称' },
      age: { type: 'number', description: '年龄' },
    },
    required: ['name'],
  }

  describe('合法参数通过校验', () => {
    it('所有必需字段都提供时应通过', () => {
      const result = validateToolInput('test_tool', { name: 'hello' }, simpleSchema)
      expect(result).toBeNull()
    })

    it('所有字段都提供时应通过', () => {
      const result = validateToolInput('test_tool', { name: 'hello', age: 25 }, simpleSchema)
      expect(result).toBeNull()
    })

    it('可选字段不提供时应通过', () => {
      const result = validateToolInput('test_tool', { name: 'hello' }, simpleSchema)
      expect(result).toBeNull()
    })
  })

  describe('缺少必需字段拒绝', () => {
    it('缺少必需字段 name 应报错', () => {
      const result = validateToolInput('test_tool', {}, simpleSchema)
      expect(result).not.toBeNull()
      expect(result!.issues.some((i) => i.message.includes('name'))).toBe(true)
    })

    it('缺少多个必需字段应报多个错误', () => {
      const requiredSchema: JSONSchema = {
        type: 'object',
        properties: {
          a: { type: 'string' },
          b: { type: 'string' },
        },
        required: ['a', 'b'],
      }
      const result = validateToolInput('test_tool', {}, requiredSchema)
      expect(result).not.toBeNull()
      expect(result!.issues.length).toBe(2)
    })
  })

  describe('类型错误拒绝', () => {
    it('字符串字段传入数字应报错', () => {
      const result = validateToolInput('test_tool', { name: 123 }, simpleSchema)
      expect(result).not.toBeNull()
      expect(result!.issues.some((i) => i.message.includes('string') || i.message.includes('number'))).toBe(true)
    })

    it('数字字段传入字符串应报错', () => {
      const result = validateToolInput('test_tool', { name: 'hello', age: '25' }, simpleSchema)
      expect(result).not.toBeNull()
    })

    it('对象类型传入数组应报错', () => {
      const objSchema: JSONSchema = { type: 'object', properties: {} }
      const result = validateToolInput('test_tool', [], objSchema)
      expect(result).not.toBeNull()
    })

    it('布尔类型传入字符串应报错', () => {
      const boolSchema: JSONSchema = {
        type: 'object',
        properties: {
          flag: { type: 'boolean' },
        },
        required: ['flag'],
      }
      const result = validateToolInput('test_tool', { flag: 'true' }, boolSchema)
      expect(result).not.toBeNull()
    })

    it('整数类型传入浮点数应报错', () => {
      const intSchema: JSONSchema = {
        type: 'object',
        properties: {
          count: { type: 'integer' },
        },
        required: ['count'],
      }
      const result = validateToolInput('test_tool', { count: 1.5 }, intSchema)
      expect(result).not.toBeNull()
      expect(result!.issues.some((i) => i.message.includes('整数') || i.message.includes('integer'))).toBe(true)
    })
  })

  describe('额外字段拒绝', () => {
    it('additionalProperties: false 时额外字段应被拒绝', () => {
      const strictSchema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
        additionalProperties: false,
      }
      const result = validateToolInput('test_tool', { name: 'hello', extra: 'field' }, strictSchema)
      expect(result).not.toBeNull()
      expect(result!.issues.some((i) => i.message.includes('extra') || i.message.includes('未知'))).toBe(true)
    })

    it('默认情况下额外字段应被拒绝（additionalProperties 默认 false）', () => {
      const result = validateToolInput('test_tool', { name: 'hello', unknown: true }, simpleSchema)
      expect(result).not.toBeNull()
      expect(result!.issues.some((i) => i.message.includes('未知'))).toBe(true)
    })

    it('additionalProperties: true 时额外字段应通过', () => {
      const openSchema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
        additionalProperties: true,
      }
      const result = validateToolInput('test_tool', { name: 'hello', extra: 'ok' }, openSchema)
      expect(result).toBeNull()
    })
  })

  describe('枚举值校验', () => {
    it('合法枚举值应通过', () => {
      const enumSchema: JSONSchema = {
        type: 'object',
        properties: {
          color: { type: 'string', enum: ['red', 'green', 'blue'] },
        },
        required: ['color'],
      }
      const result = validateToolInput('test_tool', { color: 'red' }, enumSchema)
      expect(result).toBeNull()
    })

    it('非法枚举值应被拒绝', () => {
      const enumSchema: JSONSchema = {
        type: 'object',
        properties: {
          color: { type: 'string', enum: ['red', 'green', 'blue'] },
        },
        required: ['color'],
      }
      const result = validateToolInput('test_tool', { color: 'yellow' }, enumSchema)
      expect(result).not.toBeNull()
      expect(result!.issues.some((i) => i.message.includes('red, green, blue'))).toBe(true)
    })
  })

  describe('字符串长度限制', () => {
    it('minLength 限制应生效', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 3 },
        },
        required: ['name'],
      }
      const result = validateToolInput('test_tool', { name: 'ab' }, schema)
      expect(result).not.toBeNull()
      expect(result!.issues.some((i) => i.message.includes('3'))).toBe(true)
    })

    it('maxLength 限制应生效', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', maxLength: 5 },
        },
        required: ['name'],
      }
      const result = validateToolInput('test_tool', { name: 'abcdef' }, schema)
      expect(result).not.toBeNull()
      expect(result!.issues.some((i) => i.message.includes('5'))).toBe(true)
    })

    it('长度在范围内应通过', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 10 },
        },
        required: ['name'],
      }
      const result = validateToolInput('test_tool', { name: 'hello' }, schema)
      expect(result).toBeNull()
    })
  })

  describe('formatValidationError', () => {
    it('应格式化错误信息', () => {
      const result = validateToolInput('test_tool', {}, simpleSchema)
      if (result) {
        const msg = formatValidationError(result)
        expect(msg).toContain('工具参数校验失败')
        expect(msg).toContain('name')
      }
    })
  })
})

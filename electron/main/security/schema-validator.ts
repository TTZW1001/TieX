/**
 * Schema Validator - JSON Schema 参数校验
 * 实现轻量级 JSON Schema 校验，拒绝额外未知字段
 */
import type { JSONSchema, ToolValidationError } from '../tools/agent-tool.types'

/**
 * 校验输入是否符合 JSON Schema
 * 返回 null 表示校验通过，返回 ToolValidationError 表示校验失败
 */
export function validateToolInput(
  toolName: string,
  input: unknown,
  schema: JSONSchema
): ToolValidationError | null {
  const issues: Array<{ path: string; message: string }> = []

  validateValue(input, schema, '', issues)

  if (issues.length === 0) {
    return null
  }

  return {
    code: 'TOOL_ARGUMENT_INVALID',
    toolName,
    issues,
  }
}

/**
 * 递归校验值
 */
function validateValue(
  value: unknown,
  schema: JSONSchema,
  path: string,
  issues: Array<{ path: string; message: string }>
): void {
  // 类型校验
  if (schema.type) {
    if (!checkType(value, schema.type)) {
      issues.push({
        path: path || '(root)',
        message: `期望类型 ${schema.type}，实际为 ${getTypeName(value)}`,
      })
      return
    }
  }

  // object 类型校验
  if (schema.type === 'object' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>

    // 拒绝额外未知字段
    if (schema.properties) {
      const allowedKeys = new Set(Object.keys(schema.properties))
      // additionalProperties 默认为 false（安全起见）
      const allowAdditional = schema.additionalProperties === true

      if (!allowAdditional) {
        for (const key of Object.keys(obj)) {
          if (!allowedKeys.has(key)) {
            issues.push({
              path: path ? `${path}.${key}` : key,
              message: `未知字段 "${key}"，该工具不接受此参数`,
            })
          }
        }
      }

      // 校验每个属性
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in obj) {
          validateValue(
            obj[key],
            propSchema,
            path ? `${path}.${key}` : key,
            issues
          )
        }
      }
    }

    // 必填字段校验
    if (schema.required) {
      for (const reqKey of schema.required) {
        if (!(reqKey in obj)) {
          issues.push({
            path: path ? `${path}.${reqKey}` : reqKey,
            message: `缺少必填字段 "${reqKey}"`,
          })
        }
      }
    }
  }

  // string 类型校验
  if (schema.type === 'string' && typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      issues.push({
        path: path || '(root)',
        message: `字符串长度不能小于 ${schema.minLength}`,
      })
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      issues.push({
        path: path || '(root)',
        message: `字符串长度不能超过 ${schema.maxLength}`,
      })
    }
  }

  // number/integer 类型校验
  if ((schema.type === 'number' || schema.type === 'integer') && typeof value === 'number') {
    if (schema.type === 'integer' && !Number.isInteger(value)) {
      issues.push({
        path: path || '(root)',
        message: '期望整数',
      })
    }
    if (schema.minimum !== undefined && value < schema.minimum) {
      issues.push({
        path: path || '(root)',
        message: `值不能小于 ${schema.minimum}`,
      })
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      issues.push({
        path: path || '(root)',
        message: `值不能大于 ${schema.maximum}`,
      })
    }
  }

  // enum 校验
  if (schema.enum && !schema.enum.includes(value)) {
    issues.push({
      path: path || '(root)',
      message: `值必须是以下之一: ${schema.enum.join(', ')}`,
    })
  }
}

/**
 * 检查值是否符合指定类型
 */
function checkType(value: unknown, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number' && !isNaN(value)
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value)
    case 'array':
      return Array.isArray(value)
    case 'null':
      return value === null
    default:
      return true
  }
}

/**
 * 获取值的类型名称
 */
function getTypeName(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

/**
 * 将校验错误转换为简化错误消息（回传模型用）
 */
export function formatValidationError(error: ToolValidationError): string {
  const lines = error.issues.map((i) => `${i.path}: ${i.message}`)
  return `工具参数校验失败:\n${lines.join('\n')}`
}

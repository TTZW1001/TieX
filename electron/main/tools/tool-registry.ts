/**
 * Tool Registry - 工具注册与查找
 * 验证工具名称唯一性，提供工具查找功能
 */
import type { AgentTool, ToolDefinition } from './agent-tool.types'

class ToolRegistryImpl {
  private tools = new Map<string, AgentTool>()

  /**
   * 注册工具
   * 工具名称必须唯一
   */
  register(tool: AgentTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`工具 "${tool.name}" 已注册，不能重复注册`)
    }
    this.tools.set(tool.name, tool)
  }

  /**
   * 查找工具
   */
  get(name: string): AgentTool | null {
    return this.tools.get(name) ?? null
  }

  /**
   * 检查工具是否已注册
   */
  has(name: string): boolean {
    return this.tools.has(name)
  }

  /**
   * 获取所有已注册工具
   */
  list(): AgentTool[] {
    return Array.from(this.tools.values())
  }

  /**
   * 获取所有工具定义（发送给模型的格式）
   */
  getToolDefinitions(): ToolDefinition[] {
    return this.list().map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.schema,
      },
    }))
  }

  /**
   * 清除所有注册工具
   */
  clear(): void {
    this.tools.clear()
  }
}

/** 全局工具注册表单例 */
export const toolRegistry = new ToolRegistryImpl()

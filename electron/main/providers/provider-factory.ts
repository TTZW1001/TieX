/**
 * Provider 工厂 - 根据 provider_type 动态创建模型服务商实例
 */
import type { IModelProvider } from './model-provider'
import { DeepSeekProvider } from './deepseek-provider'

/** 已注册的 Provider 构造器 */
const providerRegistry = new Map<string, () => IModelProvider>()

// 注册内置 Provider
providerRegistry.set('deepseek', () => new DeepSeekProvider())

/**
 * 根据 provider_type 获取 Provider 实例
 */
export function getProvider(providerType: string): IModelProvider {
  const factory = providerRegistry.get(providerType)
  if (!factory) {
    throw new Error(`不支持的模型服务商类型: ${providerType}`)
  }
  return factory()
}

/**
 * 注册自定义 Provider（供扩展使用）
 */
export function registerProvider(providerType: string, factory: () => IModelProvider): void {
  providerRegistry.set(providerType, factory)
}

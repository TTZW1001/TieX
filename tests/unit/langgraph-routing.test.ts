import { describe, expect, it } from 'vitest'
import {
  decideAfterMemory,
  decideAfterResearch,
  decideAfterRoute,
} from '@electron/main/agent/langgraph-routing'

describe('LangGraph routing', () => {
  it('优先从主 Agent 路由到资料整理 Agent', () => {
    expect(
      decideAfterRoute({
        routePlan: {
          useResearch: true,
          useMemory: true,
          useImplementation: true,
          reason: '需要完整执行',
        },
      })
    ).toBe('research')
  })

  it('当不需要整理时直接进入规则记忆 Agent', () => {
    expect(
      decideAfterRoute({
        routePlan: {
          useResearch: false,
          useMemory: true,
          useImplementation: true,
          reason: '先提炼规则',
        },
      })
    ).toBe('memory')
  })

  it('当只需执行时直接进入实现 Agent', () => {
    expect(
      decideAfterRoute({
        routePlan: {
          useResearch: false,
          useMemory: false,
          useImplementation: true,
          reason: '直接执行',
        },
      })
    ).toBe('implementation')
  })

  it('当无需子 Agent 时直接回复用户', () => {
    expect(
      decideAfterRoute({
        routePlan: {
          useResearch: false,
          useMemory: false,
          useImplementation: false,
          reason: '普通问答',
        },
      })
    ).toBe('respond')
  })

  it('资料整理完成后按配置继续流转', () => {
    expect(
      decideAfterResearch({
        routePlan: {
          useResearch: true,
          useMemory: true,
          useImplementation: false,
          reason: '继续整理规则',
        },
      })
    ).toBe('memory')

    expect(
      decideAfterResearch({
        routePlan: {
          useResearch: true,
          useMemory: false,
          useImplementation: true,
          reason: '进入执行',
        },
      })
    ).toBe('implementation')
  })

  it('规则记忆结束后决定执行还是直接回复', () => {
    expect(
      decideAfterMemory({
        routePlan: {
          useResearch: false,
          useMemory: true,
          useImplementation: true,
          reason: '还要执行',
        },
      })
    ).toBe('implementation')

    expect(
      decideAfterMemory({
        routePlan: {
          useResearch: false,
          useMemory: true,
          useImplementation: false,
          reason: '直接总结',
        },
      })
    ).toBe('respond')
  })
})

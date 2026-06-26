import type { AgentRoutePlan } from './agent-runtime-core'

export interface AgentGraphRouteState {
  routePlan: AgentRoutePlan | null
}

export function decideAfterRoute(state: AgentGraphRouteState) {
  if (state.routePlan?.useResearch) return 'research'
  if (state.routePlan?.useMemory) return 'memory'
  if (state.routePlan?.useImplementation) return 'implementation'
  return 'respond'
}

export function decideAfterResearch(state: AgentGraphRouteState) {
  if (state.routePlan?.useMemory) return 'memory'
  if (state.routePlan?.useImplementation) return 'implementation'
  return 'respond'
}

export function decideAfterMemory(state: AgentGraphRouteState) {
  if (state.routePlan?.useImplementation) return 'implementation'
  return 'respond'
}

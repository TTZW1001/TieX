import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import { MessageRepository } from '../database/repositories/message.repository'
import { TaskStepRepository } from '../database/repositories/task-step.repository'
import type { RuntimeContext } from './task-controller'
import {
  type AgentRoutePlan,
  routeByResponder,
  runCollaboratorBrief,
  runImplementationPass,
  runResponderPass,
} from './agent-runtime-core'
import {
  decideAfterMemory,
  decideAfterResearch,
  decideAfterRoute,
} from './langgraph-routing'

const messageRepo = new MessageRepository()
const taskStepRepo = new TaskStepRepository()

const AgentGraphState = Annotation.Root({
  runtime: Annotation<RuntimeContext>,
  assistantMessageId: Annotation<string>,
  routePlan: Annotation<AgentRoutePlan | null>,
  researchNote: Annotation<string>,
  memoryNote: Annotation<string>,
  implementationOutput: Annotation<string>,
  finalReply: Annotation<string>,
})

type AgentGraphStateType = typeof AgentGraphState.State

async function routeNode(state: AgentGraphStateType) {
  return {
    routePlan: await routeByResponder(state.runtime),
  }
}

async function researchNode(state: AgentGraphStateType) {
  const note = await runCollaboratorBrief('research', state.runtime)
  return {
    researchNote: note,
  }
}

async function memoryNode(state: AgentGraphStateType) {
  const note = await runCollaboratorBrief('memory', state.runtime)
  return {
    memoryNote: note,
  }
}

async function implementationNode(state: AgentGraphStateType) {
  return runImplementationPass(state.runtime, state.assistantMessageId)
}

async function respondNode(state: AgentGraphStateType) {
  const finalReply = await runResponderPass(state.runtime, state.implementationOutput)
  messageRepo.updateContent(state.assistantMessageId, finalReply)
  messageRepo.setStreaming(state.assistantMessageId, 0)

  if (state.implementationOutput.trim()) {
    const implSeq = taskStepRepo.getNextSequenceNo(state.runtime.taskId)
    const implStep = taskStepRepo.create({
      task_id: state.runtime.taskId,
      sequence_no: implSeq,
      step_type: 'implementation_result',
      content: state.implementationOutput.slice(0, 4000),
    })
    taskStepRepo.updateStatus(implStep.id, 'completed')
  }

  const textSeq = taskStepRepo.getNextSequenceNo(state.runtime.taskId)
  const textStep = taskStepRepo.create({
    task_id: state.runtime.taskId,
    sequence_no: textSeq,
    step_type: 'text_response',
    content: finalReply.slice(0, 200),
  })
  taskStepRepo.updateStatus(textStep.id, 'completed')

  return {
    finalReply,
  }
}

const agentGraph = new StateGraph(AgentGraphState)
  .addNode('route', routeNode)
  .addNode('research', researchNode)
  .addNode('memory', memoryNode)
  .addNode('implementation', implementationNode)
  .addNode('respond', respondNode)
  .addEdge(START, 'route')
  .addConditionalEdges('route', decideAfterRoute)
  .addConditionalEdges('research', decideAfterResearch)
  .addConditionalEdges('memory', decideAfterMemory)
  .addEdge('implementation', 'respond')
  .addEdge('respond', END)
  .compile({ name: 'tiex-agent-orchestrator' })

export async function runAgentGraph(input: {
  runtime: RuntimeContext
  assistantMessageId: string
}) {
  return agentGraph.invoke({
    runtime: input.runtime,
    assistantMessageId: input.assistantMessageId,
    routePlan: null,
    researchNote: '',
    memoryNote: '',
    implementationOutput: '',
    finalReply: '',
  })
}

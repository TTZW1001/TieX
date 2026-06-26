import { ipcMain } from 'electron'
import {
  IPC_MEMORY_GET_CANDIDATES,
  IPC_MEMORY_GET_GLOBAL,
  IPC_MEMORY_APPROVE_CANDIDATE,
  IPC_MEMORY_REJECT_CANDIDATE,
  IPC_MEMORY_GET_CONVERSATION_SUMMARY,
  IPC_MEMORY_SET_GLOBAL,
  IPC_MEMORY_GET_WORKSPACE,
  IPC_MEMORY_SET_WORKSPACE,
} from '../../shared/ipc'
import { MemoryService } from '../services/memory.service'

const memoryService = new MemoryService()

export function registerMemoryIpc(): void {
  ipcMain.handle(IPC_MEMORY_GET_GLOBAL, async () => memoryService.getGlobalMemory())

  ipcMain.handle(IPC_MEMORY_GET_CANDIDATES, async (_event, status?: 'pending' | 'approved' | 'rejected') => {
    return memoryService.listCandidates(status)
  })

  ipcMain.handle(IPC_MEMORY_SET_GLOBAL, async (_event, content: string) => {
    memoryService.setGlobalMemory(content ?? '')
  })

  ipcMain.handle(IPC_MEMORY_GET_WORKSPACE, async (_event, workspaceId: string) => {
    if (!workspaceId) return null
    return memoryService.getWorkspaceMemory(workspaceId)
  })

  ipcMain.handle(IPC_MEMORY_SET_WORKSPACE, async (_event, workspaceId: string, content: string) => {
    if (!workspaceId) {
      throw new Error('workspaceId 不能为空')
    }
    return memoryService.setWorkspaceMemory(workspaceId, content ?? '')
  })

  ipcMain.handle(IPC_MEMORY_APPROVE_CANDIDATE, async (_event, candidateId: string) => {
    if (!candidateId) throw new Error('candidateId 不能为空')
    memoryService.approveCandidate(candidateId)
  })

  ipcMain.handle(IPC_MEMORY_REJECT_CANDIDATE, async (_event, candidateId: string) => {
    if (!candidateId) throw new Error('candidateId 不能为空')
    memoryService.rejectCandidate(candidateId)
  })

  ipcMain.handle(IPC_MEMORY_GET_CONVERSATION_SUMMARY, async (_event, conversationId: string) => {
    if (!conversationId) return null
    return memoryService.getConversationSummary(conversationId)
  })
}

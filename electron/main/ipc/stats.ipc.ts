import { ipcMain } from 'electron'
import {
  IPC_STATS_GET_CONVERSATION_DETAIL,
  IPC_STATS_GET_OVERVIEW,
} from '../../shared/ipc'
import { StatsService } from '../services/stats.service'

const statsService = new StatsService()

export function registerStatsIpc(): void {
  ipcMain.handle(IPC_STATS_GET_OVERVIEW, async () => statsService.getOverview())

  ipcMain.handle(IPC_STATS_GET_CONVERSATION_DETAIL, async (_event, conversationId: string) => {
    if (!conversationId) return null
    return statsService.getConversationDetail(conversationId)
  })
}

import { ipcMain } from 'electron'
import {
  IPC_CHAT_SEND,
  IPC_CHAT_STOP,
  IPC_CHAT_GET_MESSAGES,
  IPC_CHAT_GET_MESSAGES_PAGED,
  IPC_CHAT_COUNT_MESSAGES,
} from '../../shared/ipc'
import { ChatService } from '../services/chat.service'

const chatService = new ChatService()

export function registerChatIpc(): void {
  ipcMain.handle(
    IPC_CHAT_SEND,
    async (event, conversationId: string, content: string) => {
      if (!conversationId || typeof conversationId !== 'string') {
        throw new Error('conversationId 不能为空')
      }
      if (!content || typeof content !== 'string' || !content.trim()) {
        throw new Error('消息内容不能为空')
      }
      return chatService.sendMessage(event, conversationId, content)
    }
  )

  ipcMain.handle(IPC_CHAT_STOP, async (_event, conversationId: string) => {
    if (!conversationId || typeof conversationId !== 'string') {
      throw new Error('conversationId 不能为空')
    }
    chatService.stopGeneration(conversationId)
  })

  ipcMain.handle(IPC_CHAT_GET_MESSAGES, async (_event, conversationId: string) => {
    if (!conversationId || typeof conversationId !== 'string') {
      return []
    }
    return chatService.getMessages(conversationId)
  })

  ipcMain.handle(
    IPC_CHAT_GET_MESSAGES_PAGED,
    async (_event, conversationId: string, limit: number, offset: number) => {
      if (!conversationId || typeof conversationId !== 'string') {
        return []
      }
      return chatService.getMessagesPaged(conversationId, limit, offset)
    }
  )

  ipcMain.handle(IPC_CHAT_COUNT_MESSAGES, async (_event, conversationId: string) => {
    if (!conversationId || typeof conversationId !== 'string') {
      return 0
    }
    return chatService.countMessages(conversationId)
  })
}

export { chatService }

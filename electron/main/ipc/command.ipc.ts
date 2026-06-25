/**
 * 命令执行 IPC
 */
import { ipcMain } from 'electron'
import { commandService } from '../services/command.service'

export function registerCommandIpc(): void {
  // 停止命令
  ipcMain.handle('command:stop', async (_event, sessionId: string) => {
    await commandService.stop(sessionId)
    return { ok: true }
  })

  // 获取命令输出
  ipcMain.handle('command:getOutput', async (_event, sessionId: string) => {
    return commandService.getOutput(sessionId)
  })
}

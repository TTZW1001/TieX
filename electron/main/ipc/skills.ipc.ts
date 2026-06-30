import { ipcMain } from 'electron'
import {
  IPC_SKILLS_DELETE,
  IPC_SKILLS_GET_MARKET,
  IPC_SKILLS_IMPORT_CODEX,
  IPC_SKILLS_INSTALL_MARKET,
  IPC_SKILLS_LIST,
  IPC_SKILLS_OPEN_FOLDER,
  IPC_SKILLS_RESOLVE_REFS,
  IPC_SKILLS_SCAN,
  IPC_SKILLS_SET_ENABLED,
} from '../../shared/ipc'
import { SkillService } from '../services/skill.service'

const skillService = new SkillService()

export function registerSkillsIpc(): void {
  ipcMain.handle(IPC_SKILLS_LIST, async () => {
    return skillService.list()
  })

  ipcMain.handle(IPC_SKILLS_SCAN, async () => {
    return skillService.scan()
  })

  ipcMain.handle(IPC_SKILLS_SET_ENABLED, async (_event, id: string, enabled: boolean) => {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid skill id')
    }
    skillService.setEnabled(id, Boolean(enabled))
  })

  ipcMain.handle(IPC_SKILLS_DELETE, async (_event, id: string) => {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid skill id')
    }
    skillService.delete(id)
  })

  ipcMain.handle(IPC_SKILLS_GET_MARKET, async () => {
    return skillService.getMarket()
  })

  ipcMain.handle(IPC_SKILLS_INSTALL_MARKET, async (_event, id: string) => {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid market skill id')
    }
    return skillService.installMarket(id)
  })

  ipcMain.handle(IPC_SKILLS_IMPORT_CODEX, async () => {
    return skillService.importCodexSkills()
  })

  ipcMain.handle(IPC_SKILLS_OPEN_FOLDER, async () => {
    return skillService.openFolder()
  })

  ipcMain.handle(IPC_SKILLS_RESOLVE_REFS, async (_event, content: string) => {
    if (typeof content !== 'string') {
      throw new Error('Invalid content')
    }
    return skillService.resolveRefs(content)
  })
}

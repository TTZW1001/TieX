import { registerSettingsIpc } from './settings.ipc'
import { registerProviderIpc } from './provider.ipc'
import { registerConversationIpc } from './conversation.ipc'
import { registerChatIpc } from './chat.ipc'
import { registerWorkspaceIpc } from './workspace.ipc'
import { registerFileToolsIpc } from './file-tools.ipc'
import { registerTaskIpc } from './task.ipc'
import { registerPermissionIpc } from './permission.ipc'
import { registerFileChangeIpc } from './file-change.ipc'
import { registerArtifactIpc } from './artifact.ipc'
import { registerCommandIpc } from './command.ipc'

export function registerAllIpc(): void {
  registerSettingsIpc()
  registerProviderIpc()
  registerConversationIpc()
  registerChatIpc()
  registerWorkspaceIpc()
  registerFileToolsIpc()
  registerTaskIpc()
  registerPermissionIpc()
  registerFileChangeIpc()
  registerArtifactIpc()
  registerCommandIpc()
}

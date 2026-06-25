import { app, BrowserWindow, ipcMain, nativeTheme, Menu, shell } from 'electron'
import { join } from 'path'
import { initDatabase, closeDatabase } from './database/database'
import { registerAllIpc } from './ipc'
import { chatService } from './ipc/chat.ipc'
import { registerAgentTools } from './tools/agent-tools'
import { taskController } from './agent/task-controller'
import { commandService } from './services/command.service'
import { LogCleaner } from './services/log-cleaner.service'

let mainWindow: BrowserWindow | null = null
const logCleaner = new LogCleaner()
let shutdownHandled = false

function shutdownApp(): void {
  if (shutdownHandled) return
  shutdownHandled = true

  logCleaner.stop()
  chatService.abortAll()
  // 先中断任务和命令，再关闭数据库，避免清理阶段再次访问已关闭的 DB。
  taskController.interruptAllRunningTasks()
  commandService.stopAll()
  closeDatabase()
}

function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    icon: join(__dirname, '../../icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.setMenuBarVisibility(false)

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../../dist/index.html'))
  }

  // 阻止在窗口内导航到外部链接 / 本地文件，避免白屏
  // 同源（dev server / dist html）放行；其他全部走外部处理
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = process.env.VITE_DEV_SERVER_URL || 'file://dist/index.html'

    // 同源：放行（router 跳转等）
    if (url === currentUrl || url.startsWith(currentUrl)) return

    event.preventDefault()

    try {
      const parsed = new URL(url)

      // 真正的外部链接（http/https 且非同源）
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        // 再次确认不是同源
        if (currentUrl && new URL(currentUrl).origin === parsed.origin) return
        shell.openExternal(url)
        return
      }

      // file:// 协议：用系统默认应用打开
      if (parsed.protocol === 'file:') {
        const filePath = decodeURIComponent(url.replace(/^file:\/\/\/?/, ''))
        // Windows 路径里 /C:/foo 要转成 C:\foo
        const normalized = filePath.replace(/^\/([a-zA-Z]:)/, '$1').replace(/\//g, '\\')
        shell.openPath(normalized)
        return
      }

      // 其他（自定义协议、相对路径被浏览器拼成完整 URL 等）都按本地路径尝试
      // 注意：浏览器会把相对路径拼成完整 URL，比如 http://localhost:5173/选题要求简介.md
      // 这种情况下取 pathname 作为本地文件
      const looksLikeLocalFile = /[\\/]/.test(parsed.pathname) || /\.[a-z0-9]{1,5}$/i.test(parsed.pathname)
      if (looksLikeLocalFile) {
        // 如果是 dev server 下的"伪 URL"，只取路径部分
        if (currentUrl && new URL(currentUrl).origin === parsed.origin) {
          const localPath = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
          shell.openPath(localPath)
          return
        }
        shell.openPath(decodeURIComponent(parsed.pathname))
        return
      }

      // 兜底：交给系统
      shell.openExternal(url)
    } catch (err) {
      console.error('[will-navigate] failed to handle url:', url, err)
    }
  })

  // target="_blank" 弹窗请求也走系统浏览器 / 默认应用
  // 同源直接拒绝弹窗（避免新建窗口打开同源链接）
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const currentUrl = process.env.VITE_DEV_SERVER_URL || 'file://dist/index.html'
      const currentOrigin = currentUrl ? new URL(currentUrl).origin : null
      const parsed = new URL(url)

      // 同源：拒绝弹窗，让它在原窗口处理（will-navigate 会兜底）
      if (currentOrigin && parsed.origin === currentOrigin) {
        return { action: 'deny' }
      }

      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(url)
      } else if (parsed.protocol === 'file:') {
        const filePath = decodeURIComponent(url.replace(/^file:\/\/\/?/, ''))
        const normalized = filePath.replace(/^\/([a-zA-Z]:)/, '$1').replace(/\//g, '\\')
        shell.openPath(normalized)
      } else {
        // 其他协议 / 路径，按本地文件兜底
        shell.openPath(decodeURIComponent(url))
      }
    } catch {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  return mainWindow
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  // 初始化数据库
  try {
    initDatabase()
  } catch (err) {
    console.error('Failed to initialize database:', err)
  }

  // 注册 Agent 工具
  registerAgentTools()

  // 注册 IPC
  registerAllIpc()

  // 启动日志定期清理
  logCleaner.start()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  shutdownApp()
})

// IPC: 窗口控制
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})
ipcMain.on('window:close', () => mainWindow?.close())

// IPC: 主题
ipcMain.handle('theme:getSystem', () => nativeTheme.shouldUseDarkColors)
ipcMain.on('theme:set', (_event, theme: 'light' | 'dark' | 'system') => {
  if (theme === 'light') {
    nativeTheme.themeSource = 'light'
  } else if (theme === 'dark') {
    nativeTheme.themeSource = 'dark'
  } else {
    nativeTheme.themeSource = 'system'
  }
})

nativeTheme.on('updated', () => {
  mainWindow?.webContents.send('theme:changed', nativeTheme.shouldUseDarkColors)
})

// IPC: 外部链接 / 本地文件
ipcMain.handle('shell:openExternal', (_event, url: string) => {
  if (!url) return { ok: false, error: 'empty url' }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    shell.openExternal(url)
    return { ok: true }
  }
  return { ok: false, error: 'unsupported protocol' }
})

ipcMain.handle('shell:openPath', async (_event, filePath: string) => {
  if (!filePath) return { ok: false, error: 'empty path' }
  // 兼容 file:// 协议
  const normalized = filePath.startsWith('file://')
    ? decodeURIComponent(filePath.replace(/^file:\/\/\/?/, ''))
    : filePath
  try {
    // shell.openPath 返回 "" 表示成功，否则返回错误信息
    const errorMessage = await shell.openPath(normalized)
    if (errorMessage) {
      console.error('[shell:openPath] failed:', normalized, errorMessage)
      return { ok: false, error: errorMessage }
    }
    return { ok: true }
  } catch (err) {
    console.error('[shell:openPath] threw:', err)
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('shell:showInFolder', (_event, filePath: string) => {
  if (!filePath) return { ok: false, error: 'empty path' }
  const normalized = filePath.startsWith('file://')
    ? decodeURIComponent(filePath.replace(/^file:\/\/\/?/, ''))
    : filePath
  shell.showItemInFolder(normalized)
  return { ok: true }
})

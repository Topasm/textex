import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import path from 'path'
import { registerIpcHandlers } from './ipc'
import { loadSettings } from './settings'
import { loadPersistentCache, savePersistentCache } from './services/compileCache'

let mainWindow: BrowserWindow | null = null

function sendToRenderer(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

function getBackgroundColor(theme: string): string {
  const resolved = resolveTheme(theme)
  switch (resolved) {
    case 'light':
      return '#faf6f0'
    case 'high-contrast':
      return '#000000'
    case 'glass':
      return '#f0f0f0'
    default:
      return '#1e1e1e'
  }
}

function resolveTheme(theme: string): string {
  if (theme === 'system') {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  }
  return theme
}

function getTitleBarOverlay(theme: string): { color: string; symbolColor: string; height: number } {
  const resolved = resolveTheme(theme)
  switch (resolved) {
    case 'light':
      return { color: '#eae3d8', symbolColor: '#3b3530', height: 36 }
    case 'high-contrast':
      return { color: '#1a1a1a', symbolColor: '#ffffff', height: 36 }
    case 'glass':
      return { color: '#e8e8e8', symbolColor: '#1a1a1a', height: 36 }
    default:
      return { color: '#333333', symbolColor: '#cccccc', height: 36 }
  }
}

function initAutoUpdater(): void {
  // Set up auto-update events, forwarding them to the renderer
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { autoUpdater } = require('electron-updater')

    autoUpdater.on('checking-for-update', () => {
      sendToRenderer('update:checking')
    })

    autoUpdater.on('update-available', (info: { version: string }) => {
      sendToRenderer('update:available', info)
    })

    autoUpdater.on('update-not-available', () => {
      sendToRenderer('update:not-available')
    })

    autoUpdater.on('download-progress', (progress: { percent: number }) => {
      sendToRenderer('update:download-progress', progress)
    })

    autoUpdater.on('update-downloaded', (info: { version: string }) => {
      sendToRenderer('update:downloaded', info)
    })

    autoUpdater.on('error', (err: Error) => {
      sendToRenderer('update:error', err.message)
    })
  } catch {
    // electron-updater is not installed — auto-update disabled
  }
}

function createWindow(theme: string): void {
  const backgroundColor = getBackgroundColor(theme)

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'TextEx',
    titleBarStyle: 'hidden',
    ...(process.platform === 'win32' && {
      titleBarOverlay: getTitleBarOverlay(theme)
    }),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
    backgroundColor
  })

  registerIpcHandlers(mainWindow)

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        shell.openExternal(url)
      }
    } catch {
      // Ignore malformed URLs
    }
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // Defer auto-updater initialization to after the window is visible,
  // so that the synchronous require('electron-updater') does not block startup.
  const win = mainWindow
  win.once('ready-to-show', () => {
    setTimeout(() => initAutoUpdater(), 3000)
  })
}

let currentTheme = 'dark'

function updateTitleBarOverlay(): void {
  if (process.platform !== 'win32' || !mainWindow || mainWindow.isDestroyed()) return
  try {
    mainWindow.setTitleBarOverlay(getTitleBarOverlay(currentTheme))
  } catch {
    // setTitleBarOverlay may not be available on older Electron versions
  }
}

app.whenReady().then(async () => {
  // Load persistent compile cache from disk
  await loadPersistentCache().catch(() => {})

  const settings = await loadSettings()
  currentTheme = settings.theme

  createWindow(currentTheme)

  // Update title bar overlay when renderer changes theme
  ipcMain.handle('settings:set-theme', (_event, theme: string) => {
    currentTheme = theme
    updateTitleBarOverlay()
  })

  // When OS dark/light mode changes, update overlay if using 'system' theme
  nativeTheme.on('updated', () => {
    if (currentTheme === 'system') {
      updateTitleBarOverlay()
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(currentTheme)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  // Save compile cache to disk for next session
  savePersistentCache().catch(() => {})
})

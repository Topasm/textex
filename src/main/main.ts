import { app, BrowserWindow, shell } from 'electron'
import path from 'path'
import { registerIpcHandlers } from './ipc'
import { loadSettings } from './settings'

let mainWindow: BrowserWindow | null = null

function sendToRenderer(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

function getBackgroundColor(theme: string): string {
  switch (theme) {
    case 'light':
      return '#faf6f0'
    case 'high-contrast':
      return '#000000'
    default:
      return '#1e1e1e'
  }
}

function createWindow(backgroundColor: string): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'TextEx',
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

app.whenReady().then(async () => {
  const settings = await loadSettings()
  const backgroundColor = getBackgroundColor(settings.theme)

  createWindow(backgroundColor)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(backgroundColor)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

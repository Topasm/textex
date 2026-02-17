import { ipcMain, BrowserWindow } from 'electron'
import path from 'path'
import { texLabManager } from '../texlab'

function validateFilePath(filePath: unknown): string {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('Invalid file path')
  }
  if (!path.isAbsolute(filePath)) {
    throw new Error('File path must be absolute')
  }
  return filePath
}

export function registerLspHandlers(
  getWindow: () => BrowserWindow | null
): void {
  function sendToWindow(channel: string, ...args: unknown[]): void {
    const win = getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, ...args)
    }
  }

  ipcMain.handle('lsp:start', async (_event, workspaceRoot: string) => {
    const validPath = validateFilePath(workspaceRoot)
    texLabManager.start(validPath, {
      onMessage: (message) => {
        sendToWindow('lsp:message', message)
      },
      onStatusChange: (status, error) => {
        sendToWindow('lsp:status-change', status, error)
      }
    })
    return { success: true }
  })

  ipcMain.handle('lsp:stop', () => {
    texLabManager.stop()
    return { success: true }
  })

  ipcMain.handle('lsp:send', (_event, message: object) => {
    texLabManager.send(message)
    return { success: true }
  })

  ipcMain.handle('lsp:status', () => {
    return { status: texLabManager.getStatus() }
  })
}

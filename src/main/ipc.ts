import { ipcMain, dialog, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { compileLatex, cancelCompilation } from './compiler'
import { forwardSync, inverseSync } from './synctex'

function validateFilePath(filePath: unknown): string {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('Invalid file path')
  }
  if (!path.isAbsolute(filePath)) {
    throw new Error('File path must be absolute')
  }
  return filePath
}

export function registerIpcHandlers(win: BrowserWindow): void {
  ipcMain.handle('fs:open', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [
        { name: 'LaTeX Files', extensions: ['tex'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const filePath = result.filePaths[0]
    const content = await fs.readFile(filePath, 'utf-8')
    return { content, filePath }
  })

  ipcMain.handle('fs:save', async (_event, content: string, filePath: string) => {
    const validPath = validateFilePath(filePath)
    await fs.writeFile(validPath, content, 'utf-8')
    return { success: true }
  })

  ipcMain.handle('fs:save-as', async (_event, content: string) => {
    const result = await dialog.showSaveDialog(win, {
      defaultPath: 'untitled.tex',
      filters: [
        { name: 'LaTeX Files', extensions: ['tex'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.canceled || !result.filePath) {
      return null
    }

    await fs.writeFile(result.filePath, content, 'utf-8')
    return { filePath: result.filePath }
  })

  ipcMain.handle('latex:compile', async (_event, filePath: string) => {
    const validPath = validateFilePath(filePath)
    return compileLatex(validPath, win)
  })

  ipcMain.handle('latex:cancel', () => {
    return cancelCompilation()
  })

  ipcMain.handle('synctex:forward', async (_event, texFile: string, line: number) => {
    const validPath = validateFilePath(texFile)
    return forwardSync(validPath, line)
  })

  ipcMain.handle(
    'synctex:inverse',
    async (_event, texFile: string, page: number, x: number, y: number) => {
      const validPath = validateFilePath(texFile)
      return inverseSync(validPath, page, x, y)
    }
  )
}

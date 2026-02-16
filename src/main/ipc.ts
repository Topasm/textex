import { ipcMain, dialog, BrowserWindow } from 'electron'
import fs from 'fs/promises'
import { compileLatex } from './compiler'

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
    await fs.writeFile(filePath, content, 'utf-8')
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
    return compileLatex(filePath, win)
  })
}

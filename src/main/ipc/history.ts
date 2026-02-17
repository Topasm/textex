import { ipcMain } from 'electron'
import path from 'path'
import { saveSnapshot, getHistoryList, loadSnapshot } from '../history'

function validateFilePath(filePath: unknown): string {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('Invalid file path')
  }
  if (!path.isAbsolute(filePath)) {
    throw new Error('File path must be absolute')
  }
  return filePath
}

export function registerHistoryHandlers(): void {
  ipcMain.handle('history:save', async (_event, filePath: string, content: string) => {
    const validPath = validateFilePath(filePath)
    return saveSnapshot(validPath, content)
  })

  ipcMain.handle('history:list', async (_event, filePath: string) => {
    const validPath = validateFilePath(filePath)
    return getHistoryList(validPath)
  })

  ipcMain.handle('history:load', async (_event, snapshotPath: string) => {
    // snapshotPath is absolute within .textex/history
    return loadSnapshot(snapshotPath)
  })
}

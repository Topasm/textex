import { ipcMain } from 'electron'
import path from 'path'
import { forwardSync, inverseSync, buildLineMap } from '../synctex'

function validateFilePath(filePath: unknown): string {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('Invalid file path')
  }
  if (!path.isAbsolute(filePath)) {
    throw new Error('File path must be absolute')
  }
  return filePath
}

export function registerSynctexHandlers(): void {
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

  ipcMain.handle('synctex:build-line-map', async (_event, texFile: string) => {
    const validPath = validateFilePath(texFile)
    return buildLineMap(validPath)
  })
}

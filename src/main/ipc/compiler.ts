import { ipcMain, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { compileLatex, cancelCompilation } from '../compiler'
import { findRootFile } from '../../shared/magicComments'

function validateFilePath(filePath: unknown): string {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('Invalid file path')
  }
  if (!path.isAbsolute(filePath)) {
    throw new Error('File path must be absolute')
  }
  return filePath
}

export function registerCompilerHandlers(
  getWindow: () => BrowserWindow | null
): void {
  ipcMain.handle('latex:compile', async (_event, filePath: string) => {
    const validPath = validateFilePath(filePath)

    // Only compile .tex files
    if (!validPath.toLowerCase().endsWith('.tex')) {
      throw new Error('Only .tex files can be compiled')
    }

    // Resolve magic comment (%! TeX root = ...) to compile the root file
    let compilePath = validPath
    try {
      const content = await fs.readFile(validPath, 'utf-8')
      compilePath = findRootFile(content, validPath)
    } catch {
      // If we can't read the file, compile the original path
    }

    return compileLatex(compilePath, getWindow()!)
  })

  ipcMain.handle('latex:cancel', () => {
    return cancelCompilation()
  })
}

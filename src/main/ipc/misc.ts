import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import path from 'path'
import { scanLabels } from '../labelscanner'
import { loadPackageData } from '../packageloader'
import { exportDocument, getPandocFormats } from '../pandoc'
import { parseContentOutline } from '../../shared/structure'

function validateFilePath(filePath: unknown): string {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('Invalid file path')
  }
  if (!path.isAbsolute(filePath)) {
    throw new Error('File path must be absolute')
  }
  return filePath
}

export function registerMiscHandlers(getWindow: () => BrowserWindow | null): void {
  // ---- Auto Update ----
  ipcMain.handle('update:check', async () => {
    try {
      const { autoUpdater } = await import('electron-updater')
      await autoUpdater.checkForUpdates()
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('update:download', async () => {
    try {
      const { autoUpdater } = await import('electron-updater')
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('update:install', async () => {
    try {
      const { autoUpdater } = await import('electron-updater')
      autoUpdater.quitAndInstall()
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ---- Labels ----
  ipcMain.handle('latex:scan-labels', async (_event, projectRoot: string) => {
    const validPath = validateFilePath(projectRoot)
    return scanLabels(validPath)
  })

  // ---- Package Data ----
  ipcMain.handle('latex:load-package-data', async (_event, packageNames: string[]) => {
    if (!Array.isArray(packageNames)) throw new Error('packageNames must be an array')
    return loadPackageData(packageNames)
  })

  // ---- Export ----
  ipcMain.handle('export:convert', async (_event, inputPath: string, format: string) => {
    const win = getWindow()
    const validInput = validateFilePath(inputPath)
    const ext =
      format === 'html' ? 'html' : format === 'docx' ? 'docx' : format === 'odt' ? 'odt' : 'epub'
    const result = await dialog.showSaveDialog(win!, {
      defaultPath: inputPath.replace(/\.tex$/, `.${ext}`),
      filters: [{ name: format.toUpperCase(), extensions: [ext] }]
    })
    if (result.canceled || !result.filePath) {
      return null
    }
    return exportDocument(validInput, result.filePath, format)
  })

  ipcMain.handle('export:formats', () => {
    return getPandocFormats()
  })

  // ---- Shell ----
  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    await shell.openExternal(url)
    return { success: true }
  })

  // ---- Document Structure (fallback when LSP unavailable) ----
  ipcMain.handle('structure:outline', (_event, filePath: string, content: string) => {
    const validPath = validateFilePath(filePath)
    return parseContentOutline(content, validPath)
  })
}

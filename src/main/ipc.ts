import { ipcMain, dialog, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { compileLatex, cancelCompilation } from './compiler'
import { forwardSync, inverseSync } from './synctex'
import { loadSettings, saveSettings } from './settings'
import { parseBibFile, findBibFilesInProject } from './bibparser'
import { checkWords, getSuggestions, initSpellChecker, addWord, setLanguage } from './spellcheck'
import {
  initGit,
  getGitStatus,
  stageFile,
  unstageFile,
  gitCommit,
  getDiff,
  getLog,
  isGitRepo
} from './git'
import { exportDocument, getPandocFormats } from './pandoc'

function validateFilePath(filePath: unknown): string {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('Invalid file path')
  }
  if (!path.isAbsolute(filePath)) {
    throw new Error('File path must be absolute')
  }
  return filePath
}

let directoryWatcher: ReturnType<typeof fs.watch> | null = null

let currentWindow: BrowserWindow | null = null
let handlersRegistered = false

export function registerIpcHandlers(win: BrowserWindow): void {
  currentWindow = win

  if (handlersRegistered) {
    return
  }
  handlersRegistered = true

  // ---- File System ----
  ipcMain.handle('fs:open', async () => {
    const result = await dialog.showOpenDialog(currentWindow!, {
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
    const result = await dialog.showSaveDialog(currentWindow!, {
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

  ipcMain.handle('fs:read-file', async (_event, filePath: string) => {
    const validPath = validateFilePath(filePath)
    const content = await fs.readFile(validPath, 'utf-8')
    return { content, filePath: validPath }
  })

  ipcMain.handle('fs:open-directory', async () => {
    const result = await dialog.showOpenDialog(currentWindow!, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  ipcMain.handle('fs:read-directory', async (_event, dirPath: string) => {
    const validPath = validateFilePath(dirPath)
    const entries = await fs.readdir(validPath, { withFileTypes: true })
    const result = entries
      .filter((e) => !e.name.startsWith('.'))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1
        if (!a.isDirectory() && b.isDirectory()) return 1
        return a.name.localeCompare(b.name)
      })
      .map((e) => ({
        name: e.name,
        path: path.join(validPath, e.name),
        type: e.isDirectory() ? ('directory' as const) : ('file' as const)
      }))
    return result
  })

  ipcMain.handle('fs:watch-directory', async (_event, dirPath: string) => {
    const validPath = validateFilePath(dirPath)
    // Clean up previous watcher
    if (directoryWatcher) {
      directoryWatcher = null
    }
    try {
      const watcher = fs.watch(validPath, { recursive: true })
      directoryWatcher = watcher
      ;(async () => {
        try {
          for await (const event of watcher) {
            if (event.filename) {
              currentWindow?.webContents.send('fs:directory-changed', {
                type: event.eventType,
                filename: event.filename
              })
            }
          }
        } catch {
          // watcher closed
        }
      })()
    } catch {
      // watch not supported or failed
    }
    return { success: true }
  })

  ipcMain.handle('fs:unwatch-directory', () => {
    directoryWatcher = null
    return { success: true }
  })

  // ---- LaTeX Compilation ----
  ipcMain.handle('latex:compile', async (_event, filePath: string) => {
    const validPath = validateFilePath(filePath)
    return compileLatex(validPath, currentWindow!)
  })

  ipcMain.handle('latex:cancel', () => {
    return cancelCompilation()
  })

  // ---- SyncTeX ----
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

  // ---- Settings ----
  ipcMain.handle('settings:load', async () => {
    return loadSettings()
  })

  ipcMain.handle('settings:save', async (_event, partial: Record<string, unknown>) => {
    return saveSettings(partial)
  })

  // ---- BibTeX ----
  ipcMain.handle('bib:parse', async (_event, filePath: string) => {
    const validPath = validateFilePath(filePath)
    return parseBibFile(validPath)
  })

  ipcMain.handle('bib:find-in-project', async (_event, projectRoot: string) => {
    const validPath = validateFilePath(projectRoot)
    return findBibFilesInProject(validPath)
  })

  // ---- Spell Check ----
  ipcMain.handle('spell:init', async (_event, language: string) => {
    return initSpellChecker(language)
  })

  ipcMain.handle('spell:check', async (_event, words: string[]) => {
    return checkWords(words)
  })

  ipcMain.handle('spell:suggest', async (_event, word: string) => {
    return getSuggestions(word)
  })

  ipcMain.handle('spell:add-word', async (_event, word: string) => {
    return addWord(word)
  })

  ipcMain.handle('spell:set-language', async (_event, language: string) => {
    return setLanguage(language)
  })

  // ---- Git ----
  ipcMain.handle('git:is-repo', async (_event, workDir: string) => {
    return isGitRepo(workDir)
  })

  ipcMain.handle('git:init', async (_event, workDir: string) => {
    return initGit(workDir)
  })

  ipcMain.handle('git:status', async (_event, workDir: string) => {
    return getGitStatus(workDir)
  })

  ipcMain.handle('git:stage', async (_event, workDir: string, filePath: string) => {
    return stageFile(workDir, filePath)
  })

  ipcMain.handle('git:unstage', async (_event, workDir: string, filePath: string) => {
    return unstageFile(workDir, filePath)
  })

  ipcMain.handle('git:commit', async (_event, workDir: string, message: string) => {
    return gitCommit(workDir, message)
  })

  ipcMain.handle('git:diff', async (_event, workDir: string) => {
    return getDiff(workDir)
  })

  ipcMain.handle('git:log', async (_event, workDir: string) => {
    return getLog(workDir)
  })

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

  // ---- Export ----
  ipcMain.handle('export:convert', async (_event, inputPath: string, format: string) => {
    const validInput = validateFilePath(inputPath)
    const ext =
      format === 'html' ? 'html' : format === 'docx' ? 'docx' : format === 'odt' ? 'odt' : 'epub'
    const result = await dialog.showSaveDialog(currentWindow!, {
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
}

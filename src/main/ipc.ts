import { ipcMain, dialog, BrowserWindow, shell } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { compileLatex, cancelCompilation } from './compiler'
import { forwardSync, inverseSync } from './synctex'
import { loadSettings, saveSettings } from './settings'
import { parseBibFile, findBibFilesInProject } from '../shared/bibparser'
import { findRootFile } from '../shared/magicComments'
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
import { scanLabels } from './labelscanner'
import { loadPackageData } from './packageloader'
import { texLabManager } from './texlab'
import { zoteroProbe, zoteroSearch, zoteroCiteCAYW, zoteroExportBibtex } from './zotero'

function validateFilePath(filePath: unknown): string {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('Invalid file path')
  }
  if (!path.isAbsolute(filePath)) {
    throw new Error('File path must be absolute')
  }
  return filePath
}

function readTextFileWithEncoding(buffer: Buffer): string {
  // Check for BOM markers
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return buffer.subarray(3).toString('utf-8')
  }
  if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return buffer.subarray(2).toString('utf16le')
  }

  // Try UTF-8 — if decoding produces replacement chars, fall back to latin1
  const utf8 = buffer.toString('utf-8')
  if (utf8.includes('\uFFFD')) {
    return buffer.toString('latin1')
  }
  return utf8
}

let watcherAbort: AbortController | null = null

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
        { name: 'LaTeX Files', extensions: ['tex', 'sty', 'cls', 'bib', 'bst', 'dtx', 'ins'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const filePath = result.filePaths[0]
    const buffer = await fs.readFile(filePath)
    const content = readTextFileWithEncoding(buffer)
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
    const buffer = await fs.readFile(validPath)
    const content = readTextFileWithEncoding(buffer)
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
    // Close previous watcher
    if (watcherAbort) {
      watcherAbort.abort()
      watcherAbort = null
    }
    try {
      const abort = new AbortController()
      watcherAbort = abort
      const watcher = fs.watch(validPath, { recursive: true, signal: abort.signal })
        ; (async () => {
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
            // watcher closed or aborted
          }
        })()
    } catch {
      // watch not supported or failed
    }
    return { success: true }
  })

  ipcMain.handle('fs:unwatch-directory', () => {
    if (watcherAbort) {
      watcherAbort.abort()
      watcherAbort = null
    }
    return { success: true }
  })

  // ---- LaTeX Compilation ----
  ipcMain.handle('latex:compile', async (_event, filePath: string) => {
    const validPath = validateFilePath(filePath)

    // Resolve magic comment (%! TeX root = ...) to compile the root file
    let compilePath = validPath
    try {
      const content = await fs.readFile(validPath, 'utf-8')
      compilePath = findRootFile(content, validPath)
    } catch {
      // If we can't read the file, compile the original path
    }

    return compileLatex(compilePath, currentWindow!)
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

  // ---- LSP (TexLab) ----
  ipcMain.handle('lsp:start', async (_event, workspaceRoot: string) => {
    const validPath = validateFilePath(workspaceRoot)
    texLabManager.start(validPath, {
      onMessage: (message) => {
        currentWindow?.webContents.send('lsp:message', message)
      },
      onStatusChange: (status, error) => {
        currentWindow?.webContents.send('lsp:status-change', status, error)
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

  // ---- Zotero ----
  ipcMain.handle('zotero:probe', (_e, port?: number) => zoteroProbe(port))
  ipcMain.handle('zotero:search', (_e, term: string, port?: number) => zoteroSearch(term, port))
  ipcMain.handle('zotero:cite-cayw', (_e, port?: number) => zoteroCiteCAYW(port))
  ipcMain.handle('zotero:export-bibtex', (_e, citekeys: string[], port?: number) =>
    zoteroExportBibtex(citekeys, port)
  )
  // ---- Shell ----
  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    await shell.openExternal(url)
    return { success: true }
  })
}

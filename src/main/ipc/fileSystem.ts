import { ipcMain, dialog, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { fileCache, directoryCache, checkFileSize } from '../services/fileCache'
import { MutableDisposable, toDisposable } from '../../shared/lifecycle'

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

const watcherDisposable = new MutableDisposable()
let watchedRootDir: string | null = null

export function registerFileSystemHandlers(
  getWindow: () => BrowserWindow | null
): void {
  function sendToWindow(channel: string, ...args: unknown[]): void {
    const win = getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, ...args)
    }
  }

  ipcMain.handle('fs:open', async () => {
    const win = getWindow()
    const result = await dialog.showOpenDialog(win!, {
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

    // Check file size before opening
    const sizeInfo = await checkFileSize(filePath)
    if (sizeInfo.refuse) {
      throw new Error(
        `File is too large to open (${Math.round(sizeInfo.size / 1024 / 1024)}MB). ` +
        `Files larger than 50MB cannot be opened to prevent editor freezing.`
      )
    }

    const buffer = await fs.readFile(filePath)
    const content = readTextFileWithEncoding(buffer)

    // Cache the file content
    const stat = await fs.stat(filePath)
    fileCache.set(filePath, content, stat.mtimeMs, stat.size)

    return { content, filePath, warnLargeFile: sizeInfo.warn }
  })

  ipcMain.handle('fs:save', async (_event, content: string, filePath: string) => {
    const validPath = validateFilePath(filePath)
    await fs.writeFile(validPath, content, 'utf-8')
    // Invalidate cache for saved file - it will be re-cached on next read
    fileCache.invalidate(validPath)
    // Invalidate parent directory cache since file mtime changed
    directoryCache.invalidateForChange(validPath)
    return { success: true }
  })

  // Batch save: write multiple files concurrently
  ipcMain.handle('fs:save-batch', async (_event, files: Array<{ content: string; filePath: string }>) => {
    if (!Array.isArray(files)) throw new Error('files must be an array')
    await Promise.all(
      files.map(async ({ content, filePath }) => {
        const validPath = validateFilePath(filePath)
        await fs.writeFile(validPath, content, 'utf-8')
        fileCache.invalidate(validPath)
        directoryCache.invalidateForChange(validPath)
      })
    )
    return { success: true }
  })

  ipcMain.handle('fs:save-as', async (_event, content: string) => {
    const win = getWindow()
    const result = await dialog.showSaveDialog(win!, {
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
    fileCache.invalidate(result.filePath)
    return { filePath: result.filePath }
  })

  ipcMain.handle('fs:create-template-project', async (_event, templateName: string, content: string) => {
    const win = getWindow()
    const defaultName = templateName.toLowerCase().replace(/[\s/\\]+/g, '-')
    const result = await dialog.showSaveDialog(win!, {
      title: 'Create Project Folder',
      defaultPath: defaultName,
      buttonLabel: 'Create Project'
    })

    if (result.canceled || !result.filePath) {
      return null
    }

    const projectDir = result.filePath
    const mainTexPath = path.join(projectDir, 'main.tex')

    await fs.mkdir(projectDir, { recursive: true })
    await fs.writeFile(mainTexPath, content, 'utf-8')

    return { projectPath: projectDir, filePath: mainTexPath }
  })

  ipcMain.handle('fs:read-file', async (_event, filePath: string) => {
    const validPath = validateFilePath(filePath)

    // Check file size before reading
    const sizeInfo = await checkFileSize(validPath)
    if (sizeInfo.refuse) {
      throw new Error(
        `File is too large to open (${Math.round(sizeInfo.size / 1024 / 1024)}MB). ` +
        `Files larger than 50MB cannot be opened to prevent editor freezing.`
      )
    }

    // Check cache first
    const cached = await fileCache.get(validPath)
    if (cached) {
      return { content: cached.content, filePath: validPath, warnLargeFile: sizeInfo.warn }
    }

    const buffer = await fs.readFile(validPath)
    const content = readTextFileWithEncoding(buffer)

    // Cache the result
    const stat = await fs.stat(validPath)
    fileCache.set(validPath, content, stat.mtimeMs, stat.size)

    return { content, filePath: validPath, warnLargeFile: sizeInfo.warn }
  })

  ipcMain.handle('fs:open-directory', async () => {
    const win = getWindow()
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  ipcMain.handle('fs:read-directory', async (_event, dirPath: string) => {
    const validPath = validateFilePath(dirPath)

    // Check directory listing cache
    const cached = directoryCache.get(validPath)
    if (cached) {
      return cached.entries
    }

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

    // Cache the directory listing
    directoryCache.set(validPath, result)

    return result
  })

  ipcMain.handle('fs:watch-directory', async (_event, dirPath: string) => {
    const validPath = validateFilePath(dirPath)
    // Dispose previous watcher (MutableDisposable auto-disposes the old value)
    watchedRootDir = validPath
    try {
      const abort = new AbortController()
      watcherDisposable.value = toDisposable(() => abort.abort())
      const watcher = fs.watch(validPath, { recursive: true, signal: abort.signal })
        ; (async () => {
          try {
            for await (const event of watcher) {
              if (event.filename) {
                // Invalidate directory and file caches on change
                const changedPath = path.join(validPath, event.filename)
                directoryCache.invalidateForChange(changedPath)
                fileCache.invalidate(changedPath)

                sendToWindow('fs:directory-changed', {
                  type: event.eventType,
                  filename: event.filename
                })
              }
            }
          } catch (err) {
            // Forward watcher errors (unless it was just an abort)
            if (err instanceof Error && err.name !== 'AbortError') {
              sendToWindow('fs:watch-error', err.message)
            }
          }
        })()
    } catch {
      // watch not supported or failed
    }
    return { success: true }
  })

  ipcMain.handle('fs:create-file', async (_event, filePath: string) => {
    const validPath = validateFilePath(filePath)
    await fs.writeFile(validPath, '', 'utf-8')
    directoryCache.invalidateForChange(validPath)
    return { success: true }
  })

  ipcMain.handle('fs:create-directory', async (_event, dirPath: string) => {
    const validPath = validateFilePath(dirPath)
    await fs.mkdir(validPath, { recursive: true })
    directoryCache.invalidateForChange(validPath)
    return { success: true }
  })

  ipcMain.handle('fs:copy-file', async (_event, source: string, dest: string) => {
    const validSource = validateFilePath(source)
    const validDest = validateFilePath(dest)
    await fs.copyFile(validSource, validDest)
    fileCache.invalidate(validDest)
    directoryCache.invalidateForChange(validDest)
    return { success: true }
  })

  ipcMain.handle('fs:unwatch-directory', () => {
    watcherDisposable.dispose()
    watchedRootDir = null
    return { success: true }
  })
}

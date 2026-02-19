import { ipcMain, dialog, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import {
  fileCache,
  directoryCache,
  checkFileSize,
  readFileAuto,
  retryTransient,
  getCacheStats
} from '../services/fileCache'
import { DisposableStore, toDisposable } from '../../shared/lifecycle'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf-8')
  }
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le')
  }

  // Try UTF-8 — if decoding produces replacement chars, fall back to latin1
  const utf8 = buffer.toString('utf-8')
  if (utf8.includes('\uFFFD')) {
    return buffer.toString('latin1')
  }
  return utf8
}

// ---------------------------------------------------------------------------
// Debounced batch change notification
// ---------------------------------------------------------------------------

/** Directories/patterns to exclude from watcher events. */
const WATCH_EXCLUDE_DIRS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  '__pycache__',
  '.tectonic'
])

interface FileChangeEvent {
  type: string
  filename: string
}

/**
 * Creates a batched notifier that collects file-change events over a short
 * time window and delivers them in a single IPC message. This prevents the
 * renderer from being overwhelmed when many files change at once (e.g.
 * during a git checkout or build step).
 */
function createBatchedNotifier(
  sendToWindow: (channel: string, ...args: unknown[]) => void,
  batchWindowMs = 100
) {
  let pending: FileChangeEvent[] = []
  let timer: ReturnType<typeof setTimeout> | null = null

  function schedule(event: FileChangeEvent): void {
    pending.push(event)
    if (timer === null) {
      timer = setTimeout(flush, batchWindowMs)
    }
  }

  function flush(): void {
    timer = null
    if (pending.length === 0) return

    const batch = pending
    pending = []

    // Deduplicate: keep last event per filename
    const seen = new Map<string, FileChangeEvent>()
    for (const ev of batch) {
      seen.set(ev.filename, ev)
    }
    const deduped = [...seen.values()]

    // Send individual events for backwards compatibility
    for (const ev of deduped) {
      sendToWindow('fs:directory-changed', ev)
    }
  }

  function dispose(): void {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    pending = []
  }

  return { schedule, flush, dispose }
}

/**
 * Returns true if a changed path should be ignored by the watcher
 * (e.g. inside node_modules or .git).
 */
function shouldIgnoreChange(filename: string): boolean {
  const parts = filename.split(path.sep)
  return parts.some((p) => WATCH_EXCLUDE_DIRS.has(p))
}

// ---------------------------------------------------------------------------
// Module-level watcher store reference (swapped on each watch-directory call)
// ---------------------------------------------------------------------------
const watcherStoreRef: { current: DisposableStore | null } = { current: null }

// ---------------------------------------------------------------------------
// Handler registration
// ---------------------------------------------------------------------------

export function registerFileSystemHandlers(getWindow: () => BrowserWindow | null): void {
  function sendToWindow(channel: string, ...args: unknown[]): void {
    const win = getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, ...args)
    }
  }

  // ----- fs:open -----------------------------------------------------------

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

    const buffer = await readFileAuto(filePath)
    const content = readTextFileWithEncoding(buffer)

    // Cache the file content
    const stat = await retryTransient(() => fs.stat(filePath))
    fileCache.set(filePath, content, stat.mtimeMs, stat.size)

    return { content, filePath, warnLargeFile: sizeInfo.warn }
  })

  // ----- fs:save -----------------------------------------------------------

  ipcMain.handle('fs:save', async (_event, content: string, filePath: string) => {
    const validPath = validateFilePath(filePath)
    await retryTransient(() => fs.writeFile(validPath, content, 'utf-8'))
    // Invalidate cache for saved file - it will be re-cached on next read
    fileCache.invalidate(validPath)
    // Invalidate parent directory cache since file mtime changed
    directoryCache.invalidateForChange(validPath)
    return { success: true }
  })

  // ----- fs:save-batch -----------------------------------------------------

  ipcMain.handle(
    'fs:save-batch',
    async (_event, files: Array<{ content: string; filePath: string }>) => {
      if (!Array.isArray(files)) throw new Error('files must be an array')
      await Promise.all(
        files.map(async ({ content, filePath }) => {
          const validPath = validateFilePath(filePath)
          await retryTransient(() => fs.writeFile(validPath, content, 'utf-8'))
          fileCache.invalidate(validPath)
          directoryCache.invalidateForChange(validPath)
        })
      )
      return { success: true }
    }
  )

  // ----- fs:save-as --------------------------------------------------------

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

    await retryTransient(() => fs.writeFile(result.filePath!, content, 'utf-8'))
    fileCache.invalidate(result.filePath)
    return { filePath: result.filePath }
  })

  // ----- fs:create-template-project ----------------------------------------

  ipcMain.handle(
    'fs:create-template-project',
    async (_event, templateName: string, content: string) => {
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
      await retryTransient(() => fs.writeFile(mainTexPath, content, 'utf-8'))

      return { projectPath: projectDir, filePath: mainTexPath }
    }
  )

  // ----- fs:read-file ------------------------------------------------------

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

    // Use streaming read for large files, buffered for small
    const buffer = await readFileAuto(validPath)
    const content = readTextFileWithEncoding(buffer)

    // Cache the result
    const stat = await retryTransient(() => fs.stat(validPath))
    fileCache.set(validPath, content, stat.mtimeMs, stat.size)

    return { content, filePath: validPath, warnLargeFile: sizeInfo.warn }
  })

  // ----- fs:open-directory -------------------------------------------------

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

  // ----- fs:read-directory -------------------------------------------------

  ipcMain.handle('fs:read-directory', async (_event, dirPath: string) => {
    const validPath = validateFilePath(dirPath)

    // Check directory listing cache
    const cached = directoryCache.get(validPath)
    if (cached) {
      return cached.entries
    }

    const entries = await retryTransient(() => fs.readdir(validPath, { withFileTypes: true }))
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

  // ----- fs:watch-directory ------------------------------------------------

  ipcMain.handle('fs:watch-directory', async (_event, dirPath: string) => {
    const validPath = validateFilePath(dirPath)

    // Dispose previous watcher resources
    watcherStoreRef.current?.dispose()
    watcherStoreRef.current = null

    const store = new DisposableStore()

    try {
      const abort = new AbortController()
      store.add(toDisposable(() => abort.abort()))

      // Batched notifier — collects changes over a 100ms window
      const notifier = createBatchedNotifier(sendToWindow, 100)
      store.add(toDisposable(() => notifier.dispose()))

      const watcher = fs.watch(validPath, { recursive: true, signal: abort.signal })

      // Process events in background
      ;(async () => {
        try {
          for await (const event of watcher) {
            if (event.filename) {
              // Skip noisy directories
              if (shouldIgnoreChange(event.filename)) continue

              // Invalidate directory and file caches on change
              const changedPath = path.join(validPath, event.filename)
              directoryCache.invalidateForChange(changedPath)
              fileCache.invalidate(changedPath)

              notifier.schedule({
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

      watcherStoreRef.current = store
    } catch {
      // watch not supported or failed — clean up
      store.dispose()
    }

    return { success: true }
  })

  // ----- fs:create-file ----------------------------------------------------

  ipcMain.handle('fs:create-file', async (_event, filePath: string) => {
    const validPath = validateFilePath(filePath)
    await retryTransient(() => fs.writeFile(validPath, '', 'utf-8'))
    directoryCache.invalidateForChange(validPath)
    return { success: true }
  })

  // ----- fs:create-directory -----------------------------------------------

  ipcMain.handle('fs:create-directory', async (_event, dirPath: string) => {
    const validPath = validateFilePath(dirPath)
    await fs.mkdir(validPath, { recursive: true })
    directoryCache.invalidateForChange(validPath)
    return { success: true }
  })

  // ----- fs:copy-file ------------------------------------------------------

  ipcMain.handle('fs:copy-file', async (_event, source: string, dest: string) => {
    const validSource = validateFilePath(source)
    const validDest = validateFilePath(dest)
    await retryTransient(() => fs.copyFile(validSource, validDest))
    fileCache.invalidate(validDest)
    directoryCache.invalidateForChange(validDest)
    return { success: true }
  })

  // ----- fs:read-file-base64 ------------------------------------------------

  const MIME_MAP: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp'
  }

  const MAX_BASE64_SIZE = 10 * 1024 * 1024 // 10MB

  ipcMain.handle('fs:read-file-base64', async (_event, filePath: string) => {
    const validPath = validateFilePath(filePath)
    const stat = await retryTransient(() => fs.stat(validPath))
    if (stat.size > MAX_BASE64_SIZE) {
      throw new Error(`File too large for base64 encoding (${Math.round(stat.size / 1024 / 1024)}MB)`)
    }
    const ext = path.extname(validPath).toLowerCase()
    const mimeType = MIME_MAP[ext] || 'application/octet-stream'
    const buffer = await retryTransient(() => fs.readFile(validPath))
    const data = `data:${mimeType};base64,${buffer.toString('base64')}`
    return { data, mimeType }
  })

  // ----- fs:unwatch-directory ----------------------------------------------

  ipcMain.handle('fs:unwatch-directory', () => {
    watcherStoreRef.current?.dispose()
    watcherStoreRef.current = null
    return { success: true }
  })

  // ----- fs:cache-stats (diagnostic) ---------------------------------------

  ipcMain.handle('fs:cache-stats', () => {
    return getCacheStats()
  })
}

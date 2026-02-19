import { app, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { Worker } from 'worker_threads'
import { parseLatexLog } from './logparser'
import { clearSyncTexCache } from './synctex'
import {
  getTectonicPath as getSharedTectonicPath,
  compileLatex as sharedCompileLatex,
  cancelCompilation
} from '../shared/compiler'
import type { CompileResult } from '../shared/compiler'
import { checkCompileCache, updateCompileCache } from './services/compileCache'
import { enqueueCompile } from './services/compileQueue'
import type { CompilePriority } from './services/compileQueue'
import type { Diagnostic } from '../shared/types'

export { cancelCompilation }
export type { CompileResult }

const isDev = !app.isPackaged

function getTectonicPath(): string {
  return getSharedTectonicPath({
    isDev,
    resourcesPath: isDev ? undefined : process.resourcesPath
  })
}

// --- Worker Pool for log parsing ---

const POOL_SIZE = 2
const workerPool: Worker[] = []
const idleWorkers: Worker[] = []
const waitingTasks: Array<{
  log: string
  rootFile: string
  resolve: (d: Diagnostic[]) => void
}> = []

function getWorkerPath(): string {
  return path.join(__dirname, 'workers', 'logParserWorker.js')
}

function createPoolWorker(): Worker {
  const worker = new Worker(getWorkerPath())
  worker.on('error', () => {
    // Remove dead worker from pool and replace it
    const poolIdx = workerPool.indexOf(worker)
    if (poolIdx !== -1) workerPool.splice(poolIdx, 1)
    const idleIdx = idleWorkers.indexOf(worker)
    if (idleIdx !== -1) idleWorkers.splice(idleIdx, 1)
    try {
      const replacement = createPoolWorker()
      workerPool.push(replacement)
      idleWorkers.push(replacement)
      drainWorkerQueue()
    } catch {
      // Pool degraded — tasks will fall back to sync
    }
  })
  return worker
}

function initWorkerPool(): void {
  if (workerPool.length > 0) return
  for (let i = 0; i < POOL_SIZE; i++) {
    try {
      const worker = createPoolWorker()
      workerPool.push(worker)
      idleWorkers.push(worker)
    } catch {
      // Pool may be smaller than desired
    }
  }
}

function drainWorkerQueue(): void {
  while (waitingTasks.length > 0 && idleWorkers.length > 0) {
    const task = waitingTasks.shift()!
    const worker = idleWorkers.shift()!
    dispatchToWorker(worker, task.log, task.rootFile, task.resolve)
  }
}

function dispatchToWorker(
  worker: Worker,
  log: string,
  rootFile: string,
  resolve: (d: Diagnostic[]) => void
): void {
  const timeout = setTimeout(() => {
    handler.cleanup()
    // Return worker to pool (it's still alive, just slow)
    idleWorkers.push(worker)
    resolve(parseLatexLog(log, rootFile))
    drainWorkerQueue()
  }, 5000)

  const handler = {
    onMessage: (diagnostics: Diagnostic[]) => {
      handler.cleanup()
      idleWorkers.push(worker)
      resolve(diagnostics)
      drainWorkerQueue()
    },
    onError: () => {
      handler.cleanup()
      // Don't return errored worker — it will be replaced by the pool error handler
      resolve(parseLatexLog(log, rootFile))
      drainWorkerQueue()
    },
    cleanup: () => {
      clearTimeout(timeout)
      worker.removeListener('message', handler.onMessage)
      worker.removeListener('error', handler.onError)
    }
  }

  worker.on('message', handler.onMessage)
  worker.on('error', handler.onError)
  worker.postMessage({ log, rootFile })
}

/**
 * Parse LaTeX log output using a pooled worker thread.
 * Falls back to synchronous parsing if the pool is unavailable.
 */
function parseLogInWorker(log: string, rootFile: string): Promise<Diagnostic[]> {
  initWorkerPool()

  return new Promise((resolve) => {
    if (idleWorkers.length > 0) {
      const worker = idleWorkers.shift()!
      dispatchToWorker(worker, log, rootFile, resolve)
    } else if (workerPool.length > 0) {
      // All workers busy — queue the task
      waitingTasks.push({ log, rootFile, resolve })
    } else {
      // No workers at all — sync fallback
      resolve(parseLatexLog(log, rootFile))
    }
  })
}

async function doCompile(filePath: string, win: BrowserWindow): Promise<CompileResult> {
  // Check content-hash cache - skip compilation if nothing changed
  const cachedPdfPath = await checkCompileCache(filePath)
  if (cachedPdfPath) {
    try {
      await fs.access(cachedPdfPath)
      return { pdfPath: cachedPdfPath }
    } catch {
      // Cache pointed to a missing PDF, proceed with compilation
    }
  }

  // Invalidate SyncTeX cache so it's re-parsed after compilation
  clearSyncTexCache()

  // Send compile progress event
  if (!win.isDestroyed()) {
    win.webContents.send('latex:compile-progress', { stage: 'compiling', filePath })
  }

  const result = await sharedCompileLatex(filePath, {
    tectonicPath: getTectonicPath(),
    onLog: (text: string) => {
      if (!win.isDestroyed()) {
        win.webContents.send('latex:log', text)
      }
    },
    onDiagnostics: (output: string, file: string) => {
      // Parse diagnostics in a pooled worker thread to keep main process responsive
      parseLogInWorker(output, file).then((diagnostics) => {
        try {
          if (!win.isDestroyed()) {
            win.webContents.send('latex:diagnostics', diagnostics)
          }
        } catch {
          // Don't let diagnostic sending failures affect anything
        }
      })
    },
    synctex: true
  })

  // Cache the successful compilation result
  const pdfPath = filePath.replace(/\.tex$/, '.pdf')
  await updateCompileCache(filePath, pdfPath).catch(() => {
    // Non-critical: cache update failure shouldn't break compilation
  })

  // Send completion progress event
  if (!win.isDestroyed()) {
    win.webContents.send('latex:compile-progress', { stage: 'done', filePath })
  }

  return result
}

export async function compileLatex(
  filePath: string,
  win: BrowserWindow,
  priority?: CompilePriority
): Promise<CompileResult> {
  return enqueueCompile(filePath, (fp) => doCompile(fp, win), priority)
}

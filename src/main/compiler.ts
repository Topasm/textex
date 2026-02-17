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

/**
 * Parse LaTeX log output in a worker thread to avoid blocking the main process.
 * Falls back to synchronous parsing if the worker fails.
 */
function parseLogInWorker(log: string, rootFile: string): Promise<Diagnostic[]> {
  return new Promise((resolve) => {
    try {
      const workerPath = path.join(__dirname, 'workers', 'logParserWorker.js')
      const worker = new Worker(workerPath)
      const timeout = setTimeout(() => {
        worker.terminate()
        // Fallback to synchronous parse on timeout
        resolve(parseLatexLog(log, rootFile))
      }, 5000)

      worker.on('message', (diagnostics: Diagnostic[]) => {
        clearTimeout(timeout)
        worker.terminate()
        resolve(diagnostics)
      })

      worker.on('error', () => {
        clearTimeout(timeout)
        worker.terminate()
        resolve(parseLatexLog(log, rootFile))
      })

      worker.postMessage({ log, rootFile })
    } catch {
      // Worker creation failed, fall back to sync
      resolve(parseLatexLog(log, rootFile))
    }
  })
}

async function doCompile(filePath: string, win: BrowserWindow): Promise<CompileResult> {
  // Check content-hash cache - skip compilation if nothing changed
  const cachedPdfPath = await checkCompileCache(filePath)
  if (cachedPdfPath) {
    try {
      const pdfBuffer = await fs.readFile(cachedPdfPath)
      return { pdfBase64: pdfBuffer.toString('base64') }
    } catch {
      // Cache pointed to a missing PDF, proceed with compilation
    }
  }

  // Invalidate SyncTeX cache so it's re-parsed after compilation
  clearSyncTexCache()

  const result = await sharedCompileLatex(filePath, {
    tectonicPath: getTectonicPath(),
    onLog: (text: string) => {
      if (!win.isDestroyed()) {
        win.webContents.send('latex:log', text)
      }
    },
    onDiagnostics: (output: string, file: string) => {
      // Parse diagnostics in a worker thread to keep main process responsive
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

  return result
}

export async function compileLatex(filePath: string, win: BrowserWindow): Promise<CompileResult> {
  return enqueueCompile(filePath, (fp) => doCompile(fp, win))
}

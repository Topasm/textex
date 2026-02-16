import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs/promises'
import { app, BrowserWindow } from 'electron'
import { parseLatexLog } from './logparser'
import { clearSyncTexCache } from './synctex'

const isDev = !app.isPackaged

let activeProcess: ChildProcess | null = null

export function cancelCompilation(): boolean {
  if (activeProcess) {
    activeProcess.kill()
    activeProcess = null
    return true
  }
  return false
}

function getTectonicPath(): string {
  const platform = process.platform
  const binName = platform === 'win32' ? 'tectonic.exe' : 'tectonic'

  const platformDir = platform === 'win32' ? 'win' : platform === 'darwin' ? 'mac' : 'linux'

  const basePath = isDev
    ? path.join(__dirname, '../../resources/bin', platformDir)
    : path.join(process.resourcesPath!, 'bin')

  return path.join(basePath, binName)
}

export interface CompileResult {
  pdfBase64: string
}

export async function compileLatex(filePath: string, win: BrowserWindow): Promise<CompileResult> {
  const binary = getTectonicPath()
  const workDir = path.dirname(filePath)

  // Verify binary exists
  try {
    await fs.access(binary, fs.constants.X_OK)
  } catch {
    throw new Error(
      `LaTeX engine not found at ${binary}. The application may need to be reinstalled.`
    )
  }

  // Kill any running compilation before starting a new one
  cancelCompilation()

  // Invalidate SyncTeX cache so it's re-parsed after compilation
  clearSyncTexCache()

  return new Promise((resolve, reject) => {
    const args = ['-X', 'compile', '--synctex', filePath]
    const child: ChildProcess = spawn(binary, args, { cwd: workDir })
    activeProcess = child

    let output = ''

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      output += text
      win.webContents.send('latex:log', text)
    })

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      output += text
      win.webContents.send('latex:log', text)
    })

    child.on('error', (err) => {
      activeProcess = null
      reject(new Error(`Failed to start tectonic: ${err.message}`))
    })

    child.on('close', async (code, signal) => {
      activeProcess = null

      // Parse and send diagnostics regardless of exit code
      try {
        const diagnostics = parseLatexLog(output, filePath)
        win.webContents.send('latex:diagnostics', diagnostics)
      } catch {
        // Don't let diagnostic parsing failures affect compilation
      }

      if (signal) {
        reject(new Error('Compilation was cancelled'))
        return
      }

      if (code === 0) {
        const pdfPath = filePath.replace(/\.tex$/, '.pdf')
        try {
          const pdfBuffer = await fs.readFile(pdfPath)
          resolve({ pdfBase64: pdfBuffer.toString('base64') })
        } catch {
          reject(new Error(`Compilation succeeded but PDF not found at ${pdfPath}`))
        }
      } else {
        reject(new Error(output || `tectonic exited with code ${code}`))
      }
    })
  })
}

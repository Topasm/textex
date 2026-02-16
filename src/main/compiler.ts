import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs/promises'
import { app, BrowserWindow } from 'electron'

const isDev = !app.isPackaged

function getTectonicPath(): string {
  const platform = process.platform
  const binName = platform === 'win32' ? 'tectonic.exe' : 'tectonic'

  const platformDir =
    platform === 'win32' ? 'win' : platform === 'darwin' ? 'mac' : 'linux'

  const basePath = isDev
    ? path.join(__dirname, '../../resources/bin', platformDir)
    : path.join(process.resourcesPath!, 'bin')

  return path.join(basePath, binName)
}

export interface CompileResult {
  pdfBase64: string
}

export async function compileLatex(
  filePath: string,
  win: BrowserWindow
): Promise<CompileResult> {
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

  return new Promise((resolve, reject) => {
    const args = ['-X', 'compile', filePath]
    const child: ChildProcess = spawn(binary, args, { cwd: workDir })

    let stderr = ''

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderr += text
      win.webContents.send('latex:log', text)
    })

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      win.webContents.send('latex:log', text)
    })

    child.on('error', (err) => {
      reject(new Error(`Failed to start tectonic: ${err.message}`))
    })

    child.on('close', async (code) => {
      if (code === 0) {
        const pdfPath = filePath.replace(/\.tex$/, '.pdf')
        try {
          const pdfBuffer = await fs.readFile(pdfPath)
          resolve({ pdfBase64: pdfBuffer.toString('base64') })
        } catch {
          reject(new Error(`Compilation succeeded but PDF not found at ${pdfPath}`))
        }
      } else {
        reject(new Error(stderr || `tectonic exited with code ${code}`))
      }
    })
  })
}

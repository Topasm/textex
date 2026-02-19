import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs/promises'

let activeProcess: ChildProcess | null = null

export function cancelCompilation(): boolean {
  if (activeProcess) {
    activeProcess.kill()
    activeProcess = null
    return true
  }
  return false
}

export interface TectonicPathOptions {
  isDev: boolean
  resourcesPath?: string
  devBasePath?: string
}

export function getTectonicPath(options: TectonicPathOptions): string {
  const platform = process.platform
  const binName = platform === 'win32' ? 'tectonic.exe' : 'tectonic'
  const platformDir = platform === 'win32' ? 'win' : platform === 'darwin' ? 'mac' : 'linux'

  let basePath: string
  if (options.isDev) {
    const base = options.devBasePath ?? path.join(__dirname, '../../resources/bin')
    basePath = path.join(base, platformDir)
  } else {
    if (!options.resourcesPath) {
      throw new Error('resourcesPath is required in production mode')
    }
    basePath = path.join(options.resourcesPath, 'bin')
  }

  return path.join(basePath, binName)
}

export interface CompileResult {
  pdfPath: string
}

export interface CompileOptions {
  tectonicPath: string
  onLog?: (text: string) => void
  onDiagnostics?: (output: string, filePath: string) => void
  synctex?: boolean
  reruns?: number
}

export async function compileLatex(
  filePath: string,
  options: CompileOptions
): Promise<CompileResult> {
  const binary = options.tectonicPath
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

  const reruns = options.reruns

  return new Promise((resolve, reject) => {
    const args = ['-X', 'compile']
    if (options.synctex !== false) {
      args.push('--synctex')
    }
    if (reruns !== undefined) {
      args.push('--reruns', String(reruns))
    }
    args.push(filePath)

    const child: ChildProcess = spawn(binary, args, { cwd: workDir })
    activeProcess = child

    let output = ''

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      output += text
      options.onLog?.(text)
    })

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      output += text
      options.onLog?.(text)
    })

    child.on('error', (err) => {
      activeProcess = null
      reject(new Error(`Failed to start tectonic: ${err.message}`))
    })

    child.on('close', async (code, signal) => {
      activeProcess = null

      // Notify about diagnostics
      options.onDiagnostics?.(output, filePath)

      if (signal) {
        reject(new Error('Compilation was cancelled'))
        return
      }

      if (code === 0) {
        const pdfPath = filePath.replace(/\.tex$/, '.pdf')
        try {
          await fs.access(pdfPath)
          resolve({ pdfPath })
        } catch {
          reject(new Error(`Compilation succeeded but PDF not found at ${pdfPath}`))
        }
      } else {
        reject(new Error(output || `tectonic exited with code ${code}`))
      }
    })
  })
}

import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs/promises'

export interface PandocPathOptions {
  isDev: boolean
  resourcesPath?: string
  devBasePath?: string
}

export function getPandocPath(options: PandocPathOptions): string {
  const platform = process.platform
  const binName = platform === 'win32' ? 'pandoc.exe' : 'pandoc'
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

export interface ExportResult {
  success: boolean
  outputPath: string
}

export async function exportDocument(
  inputPath: string,
  outputPath: string,
  format: string,
  pandocPath: string
): Promise<ExportResult> {
  // Verify binary exists
  try {
    await fs.access(pandocPath, fs.constants.X_OK)
  } catch {
    throw new Error(
      `Pandoc not found at ${pandocPath}. Export functionality requires Pandoc to be installed.`
    )
  }

  const workDir = path.dirname(inputPath)

  return new Promise((resolve, reject) => {
    const args = [inputPath, '-o', outputPath, '-f', 'latex', '-t', format]
    const child = spawn(pandocPath, args, { cwd: workDir })

    let stderr = ''

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on('error', (err) => {
      reject(new Error(`Failed to start pandoc: ${err.message}`))
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, outputPath })
      } else {
        reject(new Error(stderr || `pandoc exited with code ${code}`))
      }
    })
  })
}

export function getPandocFormats(): { name: string; ext: string }[] {
  return [
    { name: 'HTML', ext: 'html' },
    { name: 'DOCX', ext: 'docx' },
    { name: 'ODT', ext: 'odt' },
    { name: 'EPUB', ext: 'epub' }
  ]
}

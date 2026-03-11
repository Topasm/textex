import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'

let seededCacheDir: string | null = null
const SEED_READY_FILE = '.seed-ready'

function resolveHomeDir(): string {
  return process.env.HOME || app.getPath('home')
}

function resolveWindowsLocalAppData(): string {
  return process.env.LOCALAPPDATA || path.join(resolveHomeDir(), 'AppData', 'Local')
}

export function getDefaultTectonicCacheDir(): string {
  if (process.platform === 'win32') {
    return path.join(resolveWindowsLocalAppData(), 'Tectonic')
  }
  if (process.platform === 'darwin') {
    return path.join(resolveHomeDir(), 'Library', 'Caches', 'Tectonic')
  }
  return path.join(resolveHomeDir(), '.cache', 'Tectonic')
}

function getBundledTectonicCacheSeedDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'tectonic-cache')
    : path.join(process.cwd(), 'resources', 'tectonic-cache')
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function isDirectoryEmpty(dirPath: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dirPath)
    return entries.length === 0
  } catch {
    return true
  }
}

/**
 * Seed Tectonic's cache from a bundled cache directory if the packaged app
 * ships one. This keeps current behavior unchanged when no seed exists, but
 * lets release builds include frequently used packages later.
 */
export async function ensureTectonicCacheReady(): Promise<string> {
  if (seededCacheDir) {
    return seededCacheDir
  }

  const cacheDir = process.env.TECTONIC_CACHE_DIR || getDefaultTectonicCacheDir()
  const seedDir = getBundledTectonicCacheSeedDir()
  const seedReadyPath = path.join(seedDir, SEED_READY_FILE)

  if (!(await pathExists(seedDir)) || !(await pathExists(seedReadyPath))) {
    seededCacheDir = cacheDir
    return cacheDir
  }

  if (!(await pathExists(cacheDir))) {
    await fs.mkdir(path.dirname(cacheDir), { recursive: true })
    await fs.cp(seedDir, cacheDir, { recursive: true })
    seededCacheDir = cacheDir
    return cacheDir
  }

  if (await isDirectoryEmpty(cacheDir)) {
    await fs.cp(seedDir, cacheDir, { recursive: true, force: true })
  }

  seededCacheDir = cacheDir
  return cacheDir
}

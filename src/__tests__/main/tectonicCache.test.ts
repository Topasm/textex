import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

const appMock = {
  isPackaged: false,
  getPath: vi.fn()
}

vi.mock('electron', () => ({
  app: appMock
}))

function expectedCacheDir(home: string): string {
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Caches', 'Tectonic')
  }
  if (process.platform === 'win32') {
    return path.join(home, 'AppData', 'Local', 'Tectonic')
  }
  return path.join(home, '.cache', 'Tectonic')
}

describe('tectonic cache seeding', () => {
  beforeEach(() => {
    vi.resetModules()
    appMock.getPath.mockReset()
  })

  it('ignores an unarmed seed directory', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'textex-home-'))
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'textex-cwd-'))
    await fs.mkdir(path.join(cwd, 'resources', 'tectonic-cache'), { recursive: true })
    appMock.getPath.mockImplementation((name: string) => (name === 'home' ? home : home))
    const originalCwd = process.cwd()
    const originalHome = process.env.HOME
    process.env.HOME = home
    process.chdir(cwd)

    try {
      const mod = await import('../../main/services/tectonicCache')
      const result = await mod.ensureTectonicCacheReady()
      const expected = expectedCacheDir(home)
      expect(result).toBe(expected)
      await expect(fs.access(expected)).rejects.toThrow()
    } finally {
      process.chdir(originalCwd)
      process.env.HOME = originalHome
      await fs.rm(home, { recursive: true, force: true })
      await fs.rm(cwd, { recursive: true, force: true })
    }
  })

  it('copies the seed cache when target cache is missing', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'textex-home-'))
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'textex-cwd-'))
    const seedDir = path.join(cwd, 'resources', 'tectonic-cache')
    await fs.mkdir(seedDir, { recursive: true })
    await fs.writeFile(path.join(seedDir, '.seed-ready'), '', 'utf-8')
    await fs.writeFile(path.join(seedDir, 'formats.dat'), 'seed', 'utf-8')
    appMock.getPath.mockImplementation((name: string) => (name === 'home' ? home : home))
    const originalCwd = process.cwd()
    const originalHome = process.env.HOME
    process.env.HOME = home
    process.chdir(cwd)

    try {
      const mod = await import('../../main/services/tectonicCache')
      const result = await mod.ensureTectonicCacheReady()
      expect(result).toBe(expectedCacheDir(home))
      await expect(fs.readFile(path.join(result, 'formats.dat'), 'utf-8')).resolves.toBe('seed')
    } finally {
      process.chdir(originalCwd)
      process.env.HOME = originalHome
      await fs.rm(home, { recursive: true, force: true })
      await fs.rm(cwd, { recursive: true, force: true })
    }
  })
})

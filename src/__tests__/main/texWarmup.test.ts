import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

const appMock = {
  getPath: vi.fn(),
  getVersion: vi.fn(() => '1.0.0-test')
}

const compileWarmupDocument = vi.fn()
const ensureTectonicCacheReady = vi.fn()

vi.mock('electron', () => ({
  app: appMock
}))

vi.mock('../../main/compiler', () => ({
  compileWarmupDocument
}))

vi.mock('../../main/services/tectonicCache', () => ({
  ensureTectonicCacheReady
}))

describe('tex warmup service', () => {
  beforeEach(() => {
    vi.resetModules()
    compileWarmupDocument.mockReset().mockResolvedValue({ pdfPath: '/tmp/warmup.pdf' })
    ensureTectonicCacheReady.mockReset().mockResolvedValue('/tmp/tectonic-cache')
    appMock.getPath.mockReset()
    appMock.getVersion.mockReset().mockReturnValue('1.0.0-test')
  })

  it('runs when no manifest exists and writes a completion manifest', async () => {
    const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'textex-userdata-'))
    appMock.getPath.mockImplementation(() => userData)

    try {
      const mod = await import('../../main/services/texWarmup')
      const ran = await mod.runTexWarmup()
      expect(ran).toBe(true)
      expect(ensureTectonicCacheReady).toHaveBeenCalledTimes(1)
      expect(compileWarmupDocument).toHaveBeenCalledTimes(1)
      const manifest = JSON.parse(
        await fs.readFile(path.join(userData, 'tex-warmup.json'), 'utf-8')
      ) as {
        appVersion: string
        packageHash: string
      }
      expect(manifest.appVersion).toBe('1.0.0-test')
      expect(manifest.packageHash).toBe(mod.createWarmupPackageHash())
    } finally {
      await fs.rm(userData, { recursive: true, force: true })
    }
  })

  it('skips warmup when the manifest matches app version and package hash', async () => {
    const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'textex-userdata-'))
    appMock.getPath.mockImplementation(() => userData)

    try {
      const mod = await import('../../main/services/texWarmup')
      await fs.writeFile(
        path.join(userData, 'tex-warmup.json'),
        JSON.stringify({
          appVersion: '1.0.0-test',
          packageHash: mod.createWarmupPackageHash(),
          completedAt: new Date().toISOString()
        }),
        'utf-8'
      )
      const ran = await mod.runTexWarmup()
      expect(ran).toBe(false)
      expect(compileWarmupDocument).not.toHaveBeenCalled()
    } finally {
      await fs.rm(userData, { recursive: true, force: true })
    }
  })

  it('invalidates the manifest when the warm package hash changes', async () => {
    const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'textex-userdata-'))
    appMock.getPath.mockImplementation(() => userData)

    try {
      const mod = await import('../../main/services/texWarmup')
      await fs.writeFile(
        path.join(userData, 'tex-warmup.json'),
        JSON.stringify({
          appVersion: '1.0.0-test',
          packageHash: 'stale',
          completedAt: new Date().toISOString()
        }),
        'utf-8'
      )
      await expect(mod.shouldRunTexWarmup()).resolves.toBe(true)
    } finally {
      await fs.rm(userData, { recursive: true, force: true })
    }
  })

  it('builds a warmup document and compiles it through the warmup compiler path', async () => {
    const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'textex-userdata-'))
    appMock.getPath.mockImplementation(() => userData)
    let compiledContent = ''
    compileWarmupDocument.mockImplementation(async (texPath: string) => {
      compiledContent = await fs.readFile(texPath, 'utf-8')
      return { pdfPath: '/tmp/warmup.pdf' }
    })

    try {
      const mod = await import('../../main/services/texWarmup')
      await mod.runTexWarmup()
      expect(compiledContent).toContain('\\usepackage{amsmath}')
      expect(compiledContent).toContain('\\usepackage{subcaption}')
      expect(ensureTectonicCacheReady).toHaveBeenCalledTimes(1)
    } finally {
      await fs.rm(userData, { recursive: true, force: true })
    }
  })
})

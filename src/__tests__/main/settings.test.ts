import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const appMock = {
  getPath: vi.fn()
}

vi.mock('electron', () => ({
  app: appMock
}))

describe('main settings minimap migration', () => {
  beforeEach(() => {
    vi.resetModules()
    appMock.getPath.mockReset()
  })

  it('removes deprecated minimap when loading and saving settings', async () => {
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'textex-settings-'))
    const settingsPath = path.join(userDataDir, 'settings.json')

    appMock.getPath.mockImplementation((name: string) => {
      if (name === 'userData') return userDataDir
      return userDataDir
    })

    await fs.writeFile(
      settingsPath,
      JSON.stringify(
        {
          theme: 'dark',
          fontSize: 18,
          minimap: true
        },
        null,
        2
      ),
      'utf-8'
    )

    try {
      const { loadSettings, saveSettings } = await import('../../main/settings')

      const loaded = await loadSettings()
      expect(loaded).not.toHaveProperty('minimap')
      expect(loaded.theme).toBe('dark')
      expect(loaded.fontSize).toBe(18)

      await saveSettings({ language: 'ko' })

      const saved = JSON.parse(await fs.readFile(settingsPath, 'utf-8')) as Record<string, unknown>
      expect(saved.minimap).toBeUndefined()
      expect(saved.theme).toBe('dark')
      expect(saved.fontSize).toBe(18)
      expect(saved.language).toBe('ko')
    } finally {
      await fs.rm(userDataDir, { recursive: true, force: true })
    }
  })
})

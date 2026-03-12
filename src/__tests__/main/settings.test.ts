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

describe('main recent project updates', () => {
  beforeEach(() => {
    vi.resetModules()
    appMock.getPath.mockReset()
  })

  async function setupSettingsModule(
    initialSettings: Record<string, unknown>,
    listPapersImpl?: (projectPath: string) => Promise<Array<{ title: string }>>
  ) {
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'textex-settings-'))
    const settingsPath = path.join(userDataDir, 'settings.json')

    appMock.getPath.mockImplementation((name: string) => {
      if (name === 'userData') return userDataDir
      return userDataDir
    })

    await fs.writeFile(settingsPath, JSON.stringify(initialSettings, null, 2), 'utf-8')

    vi.doMock('../../shared/structure', () => ({
      listPapers: vi.fn(listPapersImpl ?? (async () => []))
    }))

    const settingsModule = await import('../../main/settings')

    return {
      userDataDir,
      settingsPath,
      settingsModule
    }
  }

  it('preserves tag and pinned updates when path is unchanged', async () => {
    const initialSettings = {
      recentProjects: [
        {
          path: '/projects/paper-a',
          name: 'paper-a',
          lastOpened: '2026-03-10T10:00:00.000Z',
          tag: 'draft',
          pinned: false
        }
      ]
    }
    const { settingsModule, settingsPath, userDataDir } = await setupSettingsModule(initialSettings)

    try {
      await settingsModule.updateRecentProject('/projects/paper-a', {
        tag: 'camera-ready',
        pinned: true
      })

      const saved = JSON.parse(await fs.readFile(settingsPath, 'utf-8')) as {
        recentProjects: Array<Record<string, unknown>>
      }
      expect(saved.recentProjects[0].path).toBe('/projects/paper-a')
      expect(saved.recentProjects[0].tag).toBe('camera-ready')
      expect(saved.recentProjects[0].pinned).toBe(true)
    } finally {
      await fs.rm(userDataDir, { recursive: true, force: true })
    }
  })

  it('updates path, name, title, and preserves lastOpened for a valid new directory', async () => {
    const oldPath = '/projects/old-paper'
    const newPath = path.join(
      await fs.mkdtemp(path.join(os.tmpdir(), 'textex-project-')),
      'renamed-paper'
    )
    await fs.mkdir(newPath, { recursive: true })

    const initialSettings = {
      recentProjects: [
        {
          path: oldPath,
          name: 'old-paper',
          lastOpened: '2026-03-10T10:00:00.000Z',
          tag: 'draft',
          pinned: true
        }
      ]
    }
    const { settingsModule, settingsPath, userDataDir } = await setupSettingsModule(
      initialSettings,
      async (projectPath) =>
        projectPath === path.normalize(newPath) ? [{ title: 'Renamed Paper' }] : []
    )

    try {
      await settingsModule.updateRecentProject(oldPath, { path: newPath })

      const saved = JSON.parse(await fs.readFile(settingsPath, 'utf-8')) as {
        recentProjects: Array<Record<string, unknown>>
      }
      expect(saved.recentProjects[0]).toMatchObject({
        path: path.normalize(newPath),
        name: path.basename(newPath),
        title: 'Renamed Paper',
        tag: 'draft',
        pinned: true,
        lastOpened: '2026-03-10T10:00:00.000Z'
      })
    } finally {
      await fs.rm(path.dirname(newPath), { recursive: true, force: true })
      await fs.rm(userDataDir, { recursive: true, force: true })
    }
  })

  it('rejects a non-absolute replacement path', async () => {
    const initialSettings = {
      recentProjects: [
        {
          path: '/projects/paper-a',
          name: 'paper-a',
          lastOpened: '2026-03-10T10:00:00.000Z'
        }
      ]
    }
    const { settingsModule, userDataDir } = await setupSettingsModule(initialSettings)

    try {
      await expect(
        settingsModule.updateRecentProject('/projects/paper-a', { path: './relative-folder' })
      ).rejects.toThrow('Recent project path must be absolute')
    } finally {
      await fs.rm(userDataDir, { recursive: true, force: true })
    }
  })

  it('rejects a replacement path that does not exist', async () => {
    const initialSettings = {
      recentProjects: [
        {
          path: '/projects/paper-a',
          name: 'paper-a',
          lastOpened: '2026-03-10T10:00:00.000Z'
        }
      ]
    }
    const missingPath = path.join(os.tmpdir(), 'textex-missing-project-path')
    const { settingsModule, userDataDir } = await setupSettingsModule(initialSettings)

    try {
      await expect(
        settingsModule.updateRecentProject('/projects/paper-a', { path: missingPath })
      ).rejects.toThrow('Recent project path not found')
    } finally {
      await fs.rm(userDataDir, { recursive: true, force: true })
    }
  })

  it('merges duplicate recent projects when changing to an existing path', async () => {
    const existingTargetPath = path.join(
      await fs.mkdtemp(path.join(os.tmpdir(), 'textex-project-')),
      'merged-paper'
    )
    await fs.mkdir(existingTargetPath, { recursive: true })

    const initialSettings = {
      recentProjects: [
        {
          path: '/projects/source-paper',
          name: 'source-paper',
          lastOpened: '2026-03-08T10:00:00.000Z',
          tag: 'source-tag',
          pinned: false
        },
        {
          path: path.normalize(existingTargetPath),
          name: 'merged-paper',
          lastOpened: '2026-03-11T10:00:00.000Z',
          title: 'Existing Title',
          tag: 'target-tag',
          pinned: true
        }
      ]
    }
    const { settingsModule, settingsPath, userDataDir } = await setupSettingsModule(initialSettings)

    try {
      await settingsModule.updateRecentProject('/projects/source-paper', {
        path: existingTargetPath
      })

      const saved = JSON.parse(await fs.readFile(settingsPath, 'utf-8')) as {
        recentProjects: Array<Record<string, unknown>>
      }
      expect(saved.recentProjects).toHaveLength(1)
      expect(saved.recentProjects[0]).toMatchObject({
        path: path.normalize(existingTargetPath),
        name: path.basename(existingTargetPath),
        lastOpened: '2026-03-11T10:00:00.000Z',
        title: 'Existing Title',
        tag: 'source-tag',
        pinned: true
      })
    } finally {
      await fs.rm(path.dirname(existingTargetPath), { recursive: true, force: true })
      await fs.rm(userDataDir, { recursive: true, force: true })
    }
  })
})

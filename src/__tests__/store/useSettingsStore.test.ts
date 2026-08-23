import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultUserSettings } from '../../shared/defaultSettings'
import {
  hydrateSettingsFromNative,
  migratePersistedSettings,
  sanitizeSettings,
  SETTINGS_STORAGE_KEY,
  useSettingsStore
} from '../../renderer/store/useSettingsStore'

describe('useSettingsStore minimap migration', () => {
  beforeEach(() => {
    useSettingsStore.setState({ settings: createDefaultUserSettings() })
    localStorage.clear()
    vi.mocked(window.api.loadSettings).mockClear()
    vi.mocked(window.api.saveSettings).mockClear()
  })

  it('removes deprecated minimap from persisted settings via helper', () => {
    expect(
      sanitizeSettings({
        theme: 'dark',
        fontSize: 18,
        minimap: true,
        aiApiKey: 'legacy-secret'
      })
    ).toEqual({
      theme: 'dark',
      fontSize: 18
    })
  })

  it('configures persist migration to remove deprecated minimap', async () => {
    const migrate = (
      useSettingsStore as typeof useSettingsStore & {
        persist: { getOptions: () => { migrate?: (state: unknown, version: number) => unknown } }
      }
    ).persist.getOptions().migrate

    const migrated = await migrate?.(
      {
        settings: {
          theme: 'dark',
          fontSize: 16,
          minimap: true,
          aiApiKey: 'legacy-secret'
        }
      },
      0
    )

    expect(migrated).toEqual(
      migratePersistedSettings({
        settings: {
          theme: 'dark',
          fontSize: 16,
          minimap: true,
          aiApiKey: 'legacy-secret'
        }
      })
    )
    expect(migrated).toEqual({
      settings: {
        theme: 'dark',
        fontSize: 16
      }
    })
  })

  it('hydrates a fresh renderer profile from native settings', async () => {
    vi.mocked(window.api.loadSettings).mockResolvedValue({
      ...createDefaultUserSettings(),
      theme: 'dark',
      fontSize: 18,
      aiApiKey: 'legacy-secret',
      recentProjects: [
        {
          path: '/projects/paper',
          name: 'paper',
          lastOpened: '2026-08-23T00:00:00Z'
        }
      ]
    })

    await hydrateSettingsFromNative()

    expect(useSettingsStore.getState().settings).toMatchObject({ theme: 'dark', fontSize: 18 })
    expect(useSettingsStore.getState().settings.aiApiKey).toBe('')
    const saved = vi.mocked(window.api.saveSettings).mock.calls.at(-1)?.[0]
    expect(saved).not.toHaveProperty('recentProjects')
    expect(saved).not.toHaveProperty('aiApiKey')
  })

  it('preserves an existing renderer profile and exports it natively', async () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, '{}')
    useSettingsStore.setState({
      settings: {
        ...createDefaultUserSettings(),
        theme: 'glass',
        fontSize: 17
      }
    })

    await hydrateSettingsFromNative()

    expect(window.api.loadSettings).not.toHaveBeenCalled()
    expect(window.api.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'glass', fontSize: 17 })
    )
  })
})

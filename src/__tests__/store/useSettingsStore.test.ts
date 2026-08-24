import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultUserSettings } from '../../shared/defaultSettings'
import {
  hydrateSettingsFromNative,
  loadNativeSettingsSnapshot,
  migratePersistedSettings,
  sanitizeSettings,
  SETTINGS_STORAGE_KEY,
  useSettingsStore
} from '../../renderer/store/useSettingsStore'

describe('useSettingsStore minimap migration', () => {
  beforeEach(() => {
    const defaults = createDefaultUserSettings()
    useSettingsStore.setState({ settings: defaults })
    localStorage.clear()
    vi.mocked(window.api.loadSettings).mockReset().mockResolvedValue(defaults)
    vi.mocked(window.api.saveSettings).mockReset().mockResolvedValue(defaults)
    vi.mocked(window.api.setTheme).mockReset().mockResolvedValue(undefined)
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

    const nativeSettings = await loadNativeSettingsSnapshot()
    await hydrateSettingsFromNative(nativeSettings)

    expect(window.api.loadSettings).toHaveBeenCalledTimes(1)
    expect(window.api.saveSettings).toHaveBeenCalledTimes(1)
    expect(useSettingsStore.getState().settings).toMatchObject({ theme: 'dark', fontSize: 18 })
    expect(useSettingsStore.getState().settings.aiApiKey).toBe('')
    expect(window.api.setTheme).toHaveBeenCalledWith('dark')
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

    const nativeSettings = await loadNativeSettingsSnapshot()
    await hydrateSettingsFromNative(nativeSettings)

    expect(window.api.loadSettings).toHaveBeenCalledTimes(1)
    expect(window.api.saveSettings).toHaveBeenCalledTimes(1)
    expect(window.api.setTheme).toHaveBeenCalledWith('glass')
    expect(window.api.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'glass', fontSize: 17 })
    )
  })

  it('keeps a fresh renderer on defaults when the native snapshot cannot be loaded', async () => {
    vi.mocked(window.api.loadSettings).mockRejectedValueOnce(new Error('settings unavailable'))

    const nativeSettings = await loadNativeSettingsSnapshot()
    await expect(hydrateSettingsFromNative(nativeSettings)).resolves.toBeUndefined()

    expect(nativeSettings).toBeUndefined()
    expect(window.api.loadSettings).toHaveBeenCalledTimes(1)
    expect(window.api.setTheme).not.toHaveBeenCalled()
    expect(window.api.saveSettings).not.toHaveBeenCalled()
    expect(useSettingsStore.getState().settings).toEqual(createDefaultUserSettings())
  })

  it('does not mirror an existing renderer after the native snapshot load fails', async () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, '{}')
    useSettingsStore.setState({
      settings: {
        ...createDefaultUserSettings(),
        theme: 'light',
        fontSize: 16
      }
    })
    vi.mocked(window.api.loadSettings).mockRejectedValueOnce(new Error('settings unavailable'))

    const nativeSettings = await loadNativeSettingsSnapshot()
    await hydrateSettingsFromNative(nativeSettings)

    expect(window.api.loadSettings).toHaveBeenCalledTimes(1)
    expect(window.api.setTheme).not.toHaveBeenCalled()
    expect(window.api.saveSettings).not.toHaveBeenCalled()
    expect(useSettingsStore.getState().settings).toMatchObject({ theme: 'light', fontSize: 16 })
  })
})

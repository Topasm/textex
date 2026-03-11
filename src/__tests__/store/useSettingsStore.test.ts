import { describe, expect, it } from 'vitest'
import {
  migratePersistedSettings,
  sanitizeSettings,
  useSettingsStore
} from '../../renderer/store/useSettingsStore'

describe('useSettingsStore minimap migration', () => {
  it('removes deprecated minimap from persisted settings via helper', () => {
    expect(
      sanitizeSettings({
        theme: 'dark',
        fontSize: 18,
        minimap: true
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
          minimap: true
        }
      },
      0
    )

    expect(migrated).toEqual(
      migratePersistedSettings({
        settings: {
          theme: 'dark',
          fontSize: 16,
          minimap: true
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
})

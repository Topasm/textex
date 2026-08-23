import { describe, expect, it } from 'vitest'
import { getDesktopCapabilities } from '../../renderer/platform/capabilities'
import { isFeatureEnabled } from '../../renderer/utils/featureFlags'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'

describe('desktop runtime capabilities', () => {
  it('exposes native domains and disables unavailable Tauri domains', () => {
    const settings = {
      ...useSettingsStore.getState().settings,
      aiEnabled: true,
      aiProvider: 'openai' as const,
      lspEnabled: true,
      spellCheckEnabled: true
    }

    expect(getDesktopCapabilities()).toMatchObject({
      runtime: 'tauri',
      ai: true,
      citationGroups: true,
      documentExport: true,
      lsp: true,
      openExternal: true,
      performanceMemory: true,
      projectMetadata: true,
      pty: true,
      spellcheck: true,
      templates: true
    })
    expect(isFeatureEnabled(settings, 'ai')).toBe(true)
    expect(isFeatureEnabled(settings, 'lsp')).toBe(true)
    expect(isFeatureEnabled(settings, 'spellcheck')).toBe(true)
  })
})

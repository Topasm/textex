import { afterEach, describe, expect, it } from 'vitest'
import {
  configureDesktopCapabilities,
  getDesktopCapabilities
} from '../../renderer/platform/capabilities'
import { isFeatureEnabled } from '../../renderer/utils/featureFlags'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'

afterEach(() => configureDesktopCapabilities('electron'))

describe('desktop runtime capabilities', () => {
  it('exposes the complete legacy backend in Electron', () => {
    configureDesktopCapabilities('electron')

    expect(getDesktopCapabilities()).toMatchObject({
      runtime: 'electron',
      ai: true,
      documentExport: true,
      lsp: true,
      pty: true,
      spellcheck: true,
      templates: true
    })
  })

  it('disables pending backend domains in Tauri even when settings enable them', () => {
    configureDesktopCapabilities('tauri')
    const settings = {
      ...useSettingsStore.getState().settings,
      aiEnabled: true,
      aiProvider: 'openai' as const,
      lspEnabled: true,
      spellCheckEnabled: true
    }

    expect(getDesktopCapabilities()).toMatchObject({
      runtime: 'tauri',
      ai: false,
      documentExport: false,
      lsp: false,
      projectMetadata: true,
      pty: false,
      spellcheck: false,
      templates: false
    })
    expect(isFeatureEnabled(settings, 'ai')).toBe(false)
    expect(isFeatureEnabled(settings, 'lsp')).toBe(false)
    expect(isFeatureEnabled(settings, 'spellcheck')).toBe(false)
  })
})

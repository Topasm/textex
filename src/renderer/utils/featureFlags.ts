import type { UserSettings } from '../../shared/types'
import { getDesktopCapabilities } from '../platform/capabilities'

type FeatureFlag = 'git' | 'zotero' | 'ai' | 'lsp' | 'spellcheck'

/**
 * Check whether a feature is enabled in user settings.
 * Centralizes inline boolean checks scattered across components.
 */
export function isFeatureEnabled(settings: UserSettings, flag: FeatureFlag): boolean {
  const capabilities = getDesktopCapabilities()
  switch (flag) {
    case 'git':
      return settings.gitEnabled !== false
    case 'zotero':
      return !!settings.zoteroEnabled
    case 'ai':
      return capabilities.ai && !!settings.aiEnabled && !!settings.aiProvider
    case 'lsp':
      return capabilities.lsp && !!settings.lspEnabled
    case 'spellcheck':
      return capabilities.spellcheck && !!settings.spellCheckEnabled
  }
}

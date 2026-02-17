import type { UserSettings } from '../../shared/types'

type FeatureFlag = 'git' | 'zotero' | 'ai' | 'lsp' | 'spellcheck'

/**
 * Check whether a feature is enabled in user settings.
 * Centralizes inline boolean checks scattered across components.
 */
export function isFeatureEnabled(settings: UserSettings, flag: FeatureFlag): boolean {
  switch (flag) {
    case 'git':
      return settings.gitEnabled !== false
    case 'zotero':
      return !!settings.zoteroEnabled
    case 'ai':
      return !!settings.aiEnabled && !!settings.aiProvider
    case 'lsp':
      return !!settings.lspEnabled
    case 'spellcheck':
      return !!settings.spellCheckEnabled
  }
}

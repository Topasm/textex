import { create } from 'zustand'
import { subscribeWithSelector, persist } from 'zustand/middleware'
import type { UserSettings } from '../../shared/types'
import { FONT_SIZE_MIN, FONT_SIZE_MAX } from '../constants'

export type Theme = UserSettings['theme']

// Keys that the main process cares about -- sync these via IPC on change
const MAIN_PROCESS_KEYS = new Set<keyof UserSettings>([
  'aiProvider',
  'aiModel',
  'aiEnabled',
  'aiThinkingEnabled',
  'aiThinkingBudget',
  'aiPromptGenerate',
  'aiPromptFix',
  'aiPromptAcademic',
  'aiPromptSummarize',
  'aiPromptLonger',
  'aiPromptShorter',
  'spellCheckLanguage',
  'theme',
  'language'
])

/** Resolve the effective theme: 'system' → OS preference, others pass through */
export function resolveTheme(theme: string): string {
  if (theme === 'system') {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return 'dark'
  }
  return theme
}

function applyTheme(theme: string): void {
  document.documentElement.dataset.theme = resolveTheme(theme)
}

let syncTimer: ReturnType<typeof setTimeout> | undefined
function syncToMain(): void {
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    const settings = useSettingsStore.getState().settings
    const partial: Partial<UserSettings> = {}
    for (const key of MAIN_PROCESS_KEYS) {
      if (settings[key] !== undefined) {
        ;(partial as Record<string, unknown>)[key] = settings[key]
      }
    }
    window.api.saveSettings(partial).catch(() => {
      /* ignore */
    })
  }, 500)
}

export function sanitizeSettings(input: unknown): Partial<UserSettings> {
  if (!input || typeof input !== 'object') return {}
  const { minimap: _minimap, ...settings } = input as Partial<UserSettings> & {
    minimap?: unknown
  }
  return settings
}

export function migratePersistedSettings(
  persistedState: unknown
): { settings?: Partial<UserSettings> } | undefined {
  if (!persistedState || typeof persistedState !== 'object') return undefined
  const state = persistedState as { settings?: unknown }
  return {
    ...state,
    settings: sanitizeSettings(state.settings)
  }
}

const defaultSettings: UserSettings = {
  theme: 'system',
  pdfInvertMode: false,
  name: '',
  email: '',
  affiliation: '',
  fontSize: 14,
  wordWrap: true,
  vimMode: false,
  formatOnSave: true,
  autoCompile: true,
  mathPreviewEnabled: true,
  spellCheckEnabled: false,
  spellCheckLanguage: 'en-US',
  sectionHighlightEnabled: false,
  sectionHighlightColors: [
    '#e06c75', // red
    '#e5c07b', // orange/amber
    '#98c379', // green
    '#61afef', // blue
    '#c678dd', // violet
    '#56b6c2', // cyan
    '#d19a66' // warm orange
  ],
  lspEnabled: true,
  zoteroEnabled: false,
  zoteroPort: 23119,
  gitEnabled: true,
  autoUpdateEnabled: true,
  aiEnabled: false,
  aiProvider: '',
  aiModel: '',
  aiThinkingEnabled: false,
  aiThinkingBudget: 0,
  aiPromptGenerate: '',
  aiPromptFix: '',
  aiPromptAcademic: '',
  aiPromptSummarize: '',
  aiPromptLonger: '',
  aiPromptShorter: '',
  autoHideSidebar: false,
  sidebarPosition: 'left',
  showStatusBar: true,
  bibGroupMode: 'flat',
  lineNumbers: true,
  tabSize: 4,
  language: 'en',
  pdfViewMode: 'continuous',
  showPdfToolbarControls: true,
  scrollSyncEnabled: false
}

interface SettingsState {
  settings: UserSettings

  updateSetting: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void
  increaseFontSize: () => void
  decreaseFontSize: () => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    subscribeWithSelector((set, get) => ({
      settings: defaultSettings,

      updateSetting: (key, value) => {
        set((state) => ({ settings: { ...state.settings, [key]: value } }))
        // Handle side effects of specific settings
        if (key === 'theme') {
          applyTheme(value as string)
          // Update native title bar overlay to match the new theme
          window.api?.setTheme?.(value as string).catch(() => {})
        }
        // Sync main-process-relevant fields via IPC
        if (MAIN_PROCESS_KEYS.has(key)) {
          syncToMain()
        }
      },
      increaseFontSize: () => {
        const currentSize = get().settings.fontSize
        const next = Math.min(FONT_SIZE_MAX, currentSize + 1)
        set((state) => ({ settings: { ...state.settings, fontSize: next } }))
      },
      decreaseFontSize: () => {
        const currentSize = get().settings.fontSize
        const next = Math.max(FONT_SIZE_MIN, currentSize - 1)
        set((state) => ({ settings: { ...state.settings, fontSize: next } }))
      }
    })),
    {
      name: 'textex-settings-v2',
      version: 1,
      migrate: (persistedState) => migratePersistedSettings(persistedState),
      partialize: (state) => ({
        settings: state.settings
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.settings) {
          state.settings = { ...defaultSettings, ...sanitizeSettings(state.settings) }
        }
        if (state && state.settings.theme) {
          applyTheme(state.settings.theme)
        }
        // Backfill sectionHighlightColors for pre-existing settings
        if (state && !state.settings.sectionHighlightColors) {
          state.settings.sectionHighlightColors = [
            '#e06c75',
            '#e5c07b',
            '#98c379',
            '#61afef',
            '#c678dd',
            '#56b6c2',
            '#d19a66'
          ]
        }
        if (state && !state.settings.sidebarPosition) {
          state.settings.sidebarPosition = 'left'
        }
      }
    }
  )
)

// Listen for OS theme changes and re-apply when using 'system' theme
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const { theme } = useSettingsStore.getState().settings
    if (theme === 'system') {
      applyTheme('system')
    }
  })
}
// Note: the main process listens to nativeTheme.on('updated') separately
// to update the title bar overlay when OS theme changes with 'system' selected.

import { create } from 'zustand'
import { subscribeWithSelector, persist } from 'zustand/middleware'
import type { UserSettings } from '../../shared/types'
import {
  createDefaultUserSettings,
  mergeUserSettings,
  sanitizeUserSettings
} from '../../shared/defaultSettings'
import { FONT_SIZE_MIN, FONT_SIZE_MAX } from '../constants'

export type Theme = UserSettings['theme']

export const SETTINGS_STORAGE_KEY = 'textex-settings-v2'

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
function settingsForNative(settings: UserSettings): Partial<UserSettings> {
  const nativeSettings = { ...settings }
  delete nativeSettings.recentProjects
  delete nativeSettings.rendererSession
  delete nativeSettings.aiApiKey
  return nativeSettings
}

function syncToMain(): void {
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    const settings = useSettingsStore.getState().settings
    // Recent projects are maintained through validated native commands. Keep
    // every other setting mirrored natively so a different desktop shell can
    // hydrate the same preferences on first launch.
    window.api.saveSettings(settingsForNative(settings)).catch(() => {
      /* ignore */
    })
  }, 500)
}

export function sanitizeSettings(input: unknown): Partial<UserSettings> {
  return sanitizeUserSettings(input)
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

const defaultSettings = createDefaultUserSettings()

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
          void Promise.resolve(window.api?.setTheme?.(value as UserSettings['theme'])).catch(
            () => {}
          )
        }
        syncToMain()
      },
      increaseFontSize: () => {
        const currentSize = get().settings.fontSize
        const next = Math.min(FONT_SIZE_MAX, currentSize + 1)
        set((state) => ({ settings: { ...state.settings, fontSize: next } }))
        syncToMain()
      },
      decreaseFontSize: () => {
        const currentSize = get().settings.fontSize
        const next = Math.max(FONT_SIZE_MIN, currentSize - 1)
        set((state) => ({ settings: { ...state.settings, fontSize: next } }))
        syncToMain()
      }
    })),
    {
      name: SETTINGS_STORAGE_KEY,
      version: 1,
      migrate: (persistedState) => migratePersistedSettings(persistedState),
      partialize: (state) => ({
        settings: sanitizeSettings(state.settings)
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

/** Load the native settings file once for all pre-mount renderer hydration. */
export async function loadNativeSettingsSnapshot(): Promise<UserSettings | undefined> {
  try {
    return await window.api.loadSettings()
  } catch {
    // Native settings are best-effort; renderer defaults remain usable.
    return undefined
  }
}

/**
 * Establish a native settings mirror without overwriting an existing renderer
 * profile. A fresh WebView hydrates from the native file; an existing profile
 * remains authoritative and is mirrored back to Rust.
 */
export async function hydrateSettingsFromNative(
  nativeSettings: UserSettings | undefined
): Promise<void> {
  // A failed native read must not be followed by a write based on renderer
  // defaults or a potentially stale local profile.
  if (!nativeSettings) return

  try {
    const hasRendererSettings = localStorage.getItem(SETTINGS_STORAGE_KEY) !== null
    if (!hasRendererSettings) {
      const settings = mergeUserSettings({ ...nativeSettings, rendererSession: undefined })
      useSettingsStore.setState({ settings })
      applyTheme(settings.theme)
    }

    const settings = useSettingsStore.getState().settings
    try {
      await window.api.setTheme(settings.theme)
    } catch {
      // Native chrome theme support must not block settings hydration.
    }
    await window.api.saveSettings(settingsForNative(settings))
  } catch {
    // A malformed legacy profile must never prevent the editor from starting.
  }
}

// Listen for OS theme changes and re-apply when using 'system' theme
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const { theme } = useSettingsStore.getState().settings
    if (theme === 'system') {
      applyTheme('system')
    }
  })
}
// to update the title bar overlay when OS theme changes with 'system' selected.

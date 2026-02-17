import { create } from 'zustand'
import { subscribeWithSelector, persist } from 'zustand/middleware'

export type Theme = 'system' | 'dark' | 'light' | 'high-contrast'

export interface UserSettings {
  // Appearance
  theme: Theme
  pdfInvertMode: boolean

  // User Info
  name: string
  email: string
  affiliation: string

  // Editor
  fontSize: number
  wordWrap: boolean
  vimMode: boolean

  // Automation
  formatOnSave: boolean
  autoCompile: boolean

  // Math Preview
  mathPreviewEnabled: boolean

  // Spell check
  spellCheckEnabled: boolean

  // Section highlight
  sectionHighlightEnabled: boolean
  sectionHighlightColors: string[]

  // LSP
  lspEnabled: boolean

  // Zotero
  zoteroEnabled: boolean
  zoteroPort: number

  // AI Draft
  aiEnabled: boolean
  aiProvider: 'openai' | 'anthropic' | 'gemini' | ''
  aiModel: string
  aiThinkingEnabled: boolean
  aiThinkingBudget: number
  aiPromptGenerate: string
  aiPromptFix: string
  aiPromptAcademic: string
  aiPromptSummarize: string
  aiPromptLonger: string
  aiPromptShorter: string

  // Sidebar
  autoHideSidebar: boolean

  // Status Bar
  showStatusBar: boolean

  // Bibliography grouping
  bibGroupMode: 'flat' | 'author' | 'year' | 'type' | 'custom'
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
  sectionHighlightEnabled: false,
  sectionHighlightColors: [
    '#e06c75', '#e5c07b', '#98c379', '#61afef', '#c678dd', '#56b6c2', '#d19a66'
  ],
  lspEnabled: true,
  zoteroEnabled: false,
  zoteroPort: 23119,
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
  showStatusBar: true,
  bibGroupMode: 'flat'
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
        if (key === 'theme') {
          document.documentElement.dataset.theme = value as string
        }
      },
      increaseFontSize: () => {
        const currentSize = get().settings.fontSize
        const next = Math.min(32, currentSize + 1)
        set((state) => ({ settings: { ...state.settings, fontSize: next } }))
      },
      decreaseFontSize: () => {
        const currentSize = get().settings.fontSize
        const next = Math.max(8, currentSize - 1)
        set((state) => ({ settings: { ...state.settings, fontSize: next } }))
      }
    })),
    {
      name: 'textex-settings-v2',
      partialize: (state) => ({
        settings: state.settings
      }),
      onRehydrateStorage: () => (state) => {
        if (state && state.settings.theme) {
          document.documentElement.dataset.theme = state.settings.theme
        }
        if (state && !state.settings.sectionHighlightColors) {
          state.settings.sectionHighlightColors = [
            '#e06c75', '#e5c07b', '#98c379', '#61afef', '#c678dd', '#56b6c2', '#d19a66'
          ]
        }
      }
    }
  )
)

import type { RendererSessionSnapshot, UserSettings } from './types'

export const MAX_RENDERER_SESSION_ENTRY_BYTES = 2 * 1024 * 1024

const DEFAULT_SECTION_HIGHLIGHT_COLORS = [
  '#e06c75',
  '#e5c07b',
  '#98c379',
  '#61afef',
  '#c678dd',
  '#56b6c2',
  '#d19a66'
]

export function createDefaultUserSettings(): UserSettings {
  return {
    theme: 'system',
    fontSize: 14,
    latexEngine: 'tectonic',
    autoCompile: true,
    watchOpenFiles: true,
    spellCheckEnabled: false,
    spellCheckLanguage: 'en-US',
    gitEnabled: true,
    autoUpdateEnabled: true,
    zoteroEnabled: false,
    zoteroPort: 23119,
    citeOnlineToZotero: false,
    aiEnabled: false,
    aiProvider: '',
    aiApiKey: '',
    aiModel: '',
    aiThinkingEnabled: false,
    aiThinkingBudget: 0,
    aiPromptGenerate: '',
    aiPromptFix: '',
    aiPromptAcademic: '',
    aiPromptSummarize: '',
    aiPromptLonger: '',
    aiPromptShorter: '',
    wordWrap: true,
    vimMode: false,
    formatOnSave: true,
    mathPreviewEnabled: true,
    pdfInvertMode: false,
    autoHideSidebar: false,
    autoHideResearchPanel: false,
    showStatusBar: true,
    sectionHighlightEnabled: false,
    sectionHighlightColors: [...DEFAULT_SECTION_HIGHLIGHT_COLORS],
    referenceSortOrder: 'natural',
    zoteroSyncMode: 'continuous',
    lineNumbers: true,
    tabSize: 4,
    recentProjects: [],
    language: 'en',
    pdfViewMode: 'continuous',
    showPdfToolbarControls: true,
    scrollSyncEnabled: false,
    bracketPairColorization: true,
    stickyScrollEnabled: true,
    smoothScrolling: true,
    fontLigatures: false,
    minimapEnabled: false
  }
}

export function sanitizeUserSettings(input: unknown): Partial<UserSettings> {
  if (!input || typeof input !== 'object') return {}
  const settings = {
    ...(input as Partial<UserSettings> & {
      minimap?: unknown
      name?: unknown
      email?: unknown
      affiliation?: unknown
    })
  }
  delete settings.minimap
  delete settings.name
  delete settings.email
  delete settings.affiliation
  delete settings.aiApiKey
  if ('rendererSession' in settings) {
    const rendererSession = sanitizeRendererSessionSnapshot(settings.rendererSession)
    if (rendererSession) {
      settings.rendererSession = rendererSession
    } else {
      delete settings.rendererSession
    }
  }
  return settings
}

export function sanitizeRendererSessionSnapshot(
  input: unknown
): RendererSessionSnapshot | undefined {
  if (!input || typeof input !== 'object') return undefined
  const source = input as Record<string, unknown>
  if (source.version !== 1) return undefined

  const snapshot: RendererSessionSnapshot = { version: 1 }
  for (const name of ['editor', 'project', 'pdf'] as const) {
    const raw = source[name]
    if (raw === undefined) continue
    if (typeof raw !== 'string' || raw.length > MAX_RENDERER_SESSION_ENTRY_BYTES) {
      return undefined
    }
    try {
      const parsed = JSON.parse(raw) as unknown
      if (!parsed || typeof parsed !== 'object') return undefined
    } catch {
      return undefined
    }
    snapshot[name] = raw
  }
  return snapshot
}

export function mergeUserSettings(input: unknown): UserSettings {
  return {
    ...createDefaultUserSettings(),
    ...sanitizeUserSettings(input)
  }
}

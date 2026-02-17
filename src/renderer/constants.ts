// ── Timing ──────────────────────────────────────────────────
export const DEBOUNCE_ZOOM_MS = 150
export const SYNCTEX_HIGHLIGHT_MS = 1500
export const SETTINGS_SYNC_DELAY_MS = 500
export const AUTO_COMPILE_DELAY_MS = 1000
export const SWIPE_LOCK_MS = 500
export const GIT_REFRESH_INTERVAL_MS = 5000

// ── Zoom ────────────────────────────────────────────────────
export const ZOOM_MIN = 25
export const ZOOM_MAX = 400
export const ZOOM_STEP = 25

// ── Font ────────────────────────────────────────────────────
export const FONT_SIZE_MIN = 8
export const FONT_SIZE_MAX = 32

// ── Layout ──────────────────────────────────────────────────
export const SPLIT_RATIO_MIN = 0.2
export const SPLIT_RATIO_MAX = 0.8
export const SIDEBAR_DEFAULT_WIDTH = 240
export const SIDEBAR_WIDTH_MIN = 150
export const SIDEBAR_WIDTH_MAX = 500

// ── Export formats ──────────────────────────────────────────
export const EXPORT_FORMATS = [
  { name: 'HTML', ext: 'html' },
  { name: 'Word (DOCX)', ext: 'docx' },
  { name: 'OpenDocument (ODT)', ext: 'odt' },
  { name: 'EPUB', ext: 'epub' },
] as const

// ── AI Provider metadata ────────────────────────────────────
export const AI_MODEL_OPTIONS: Record<string, { value: string; label: string }[]> = {
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { value: 'o1', label: 'o1' },
    { value: 'o1-mini', label: 'o1 Mini' },
  ],
  anthropic: [
    { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
  ],
  gemini: [
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  ],
}

export const AI_PROVIDER_INFO: Record<string, { label: string; keyHint: string; keyUrl: string }> = {
  openai: { label: 'OpenAI', keyHint: 'sk-...', keyUrl: 'https://platform.openai.com/api-keys' },
  anthropic: { label: 'Anthropic', keyHint: 'sk-ant-...', keyUrl: 'https://console.anthropic.com/settings/keys' },
  gemini: { label: 'Gemini', keyHint: 'AIza...', keyUrl: 'https://aistudio.google.com/apikey' },
}

// ── Hidden editor actions ────────────────────────────────────
/** Monaco editor actions hidden from the command palette (not relevant for LaTeX editing). */
export const HIDDEN_EDITOR_ACTIONS = new Set([
  // Go-to / peek / references
  'editor.action.goToDeclaration',
  'editor.action.goToImplementation',
  'editor.action.goToReferences',
  'editor.action.goToTypeDefinition',
  'editor.action.peekDefinition',
  'editor.action.peekImplementation',
  'editor.action.peekReferences',
  'editor.action.peekTypeDefinition',
  'editor.action.revealDefinition',
  'editor.action.revealDeclaration',
  'editor.action.referenceSearch.trigger',
  'editor.action.showDefinitionPreviewHover',
  // Refactoring / code actions
  'editor.action.rename',
  'editor.action.refactor',
  'editor.action.sourceAction',
  'editor.action.organizeImports',
  'editor.action.autoFix',
  'editor.action.fixAll',
  'editor.action.codeAction',
  'editor.action.quickFix',
  // Suggestions / hints not relevant
  'editor.action.triggerParameterHints',
  'editor.action.inlineSuggest.trigger',
  'editor.action.inlineSuggest.commit',
  'editor.action.inlineSuggest.hide',
  'editor.action.inlineSuggest.showNext',
  'editor.action.inlineSuggest.showPrevious',
  // Debug / internal
  'editor.action.inspectTokens',
  'editor.action.forceRetokenize',
  'editor.action.toggleTabFocusMode',
  'editor.action.toggleRenderWhitespace',
  'editor.action.accessibilityHelp',
  'editor.action.showAccessibilityHelp',
  // Quick outline
  'editor.action.quickOutline',
  // Linked editing
  'editor.action.linkedEditing',
  // Format (we have our own Shift+Alt+F formatter)
  'editor.action.formatDocument',
  'editor.action.formatSelection',
  // Hover
  'editor.action.showHover',
])

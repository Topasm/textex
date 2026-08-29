/**
 * Keyboard shortcut metadata shared by app commands and renderer-local actions.
 *
 * Command IDs and their default shortcuts live here so Tauri menu/command-palette
 * integrations can consume the same definitions without importing renderer code.
 */

export interface ShortcutBinding {
  /** KeyboardEvent.key values accepted by the shortcut. */
  readonly key: string | readonly string[]
  /** Requires Ctrl on Windows/Linux or Command on macOS. */
  readonly mod: boolean
  /** Requires Alt/Option. */
  readonly alt?: boolean
  /** Requires Shift. */
  readonly shift?: boolean
}

export type AppCommandGroup = 'file' | 'edit' | 'view' | 'compile' | 'pdf' | 'ai' | 'app' | 'window'
export type AppCommandContextRequirement = 'document' | 'pdf' | 'project'

interface AppCommandDefinition {
  readonly id: string
  /** English fallback used when a localized palette label is unavailable. */
  readonly label: string
  readonly group: AppCommandGroup
  /** Locale-independent aliases used by command-palette search. */
  readonly keywords: readonly string[]
  readonly shortcut?: ShortcutBinding
  readonly requiredContext?: AppCommandContextRequirement
}

/**
 * Single source of truth for renderer-facing application command IDs.
 * Keep commands without a default shortcut in the manifest as well so
 * AppCommandId remains the complete cross-process command contract.
 */
export const APP_COMMAND_MANIFEST = [
  {
    id: 'file.open',
    label: 'Open File',
    group: 'file',
    keywords: ['load', 'document'],
    shortcut: { key: 'o', mod: true }
  },
  {
    id: 'file.openFolder',
    label: 'Open Folder',
    group: 'file',
    keywords: ['project', 'directory', 'workspace'],
    shortcut: { key: 'o', mod: true, shift: true }
  },
  {
    id: 'project.openTerminal',
    label: 'Open Project in Terminal',
    group: 'file',
    keywords: ['project', 'folder', 'shell', 'console'],
    requiredContext: 'project'
  },
  {
    id: 'file.save',
    label: 'Save File',
    group: 'file',
    keywords: ['write', 'document'],
    requiredContext: 'document',
    shortcut: { key: 's', mod: true }
  },
  {
    id: 'file.saveAs',
    label: 'Save File As',
    group: 'file',
    keywords: ['copy', 'rename', 'document'],
    requiredContext: 'document',
    shortcut: { key: 's', mod: true, shift: true }
  },
  {
    id: 'file.newTemplate',
    label: 'New from Template',
    group: 'file',
    keywords: ['create', 'project', 'gallery'],
    shortcut: { key: 'n', mod: true, shift: true }
  },
  {
    id: 'file.export.html',
    label: 'Export as HTML',
    group: 'file',
    keywords: ['convert', 'web'],
    requiredContext: 'document'
  },
  {
    id: 'file.export.docx',
    label: 'Export as DOCX',
    group: 'file',
    keywords: ['convert', 'word'],
    requiredContext: 'document'
  },
  {
    id: 'file.export.odt',
    label: 'Export as ODT',
    group: 'file',
    keywords: ['convert', 'open document'],
    requiredContext: 'document'
  },
  {
    id: 'file.export.epub',
    label: 'Export as EPUB',
    group: 'file',
    keywords: ['convert', 'ebook'],
    requiredContext: 'document'
  },
  {
    id: 'compile.run',
    label: 'Compile Document',
    group: 'compile',
    keywords: ['build', 'latex', 'pdf'],
    requiredContext: 'document',
    shortcut: { key: 'Enter', mod: true }
  },
  {
    id: 'compile.submissionCheck',
    label: 'Run Submission Check',
    group: 'compile',
    keywords: ['paper', 'validate', 'references', 'anonymous', 'venue'],
    requiredContext: 'document'
  },
  {
    id: 'ai.draft',
    label: 'Create AI Draft',
    group: 'ai',
    keywords: ['generate', 'write', 'assistant'],
    shortcut: { key: ['d', 'D'], mod: true, shift: true }
  },
  {
    id: 'edit.find',
    label: 'Find in Document',
    group: 'edit',
    keywords: ['search', 'text'],
    requiredContext: 'document',
    shortcut: { key: 'f', mod: true }
  },
  {
    id: 'view.toggleSidebar',
    label: 'Toggle Sidebar',
    group: 'view',
    keywords: ['files', 'navigation', 'panel'],
    shortcut: { key: 'b', mod: true }
  },
  {
    id: 'view.toggleResearchPanel',
    label: 'Toggle Research Panel',
    group: 'view',
    keywords: ['references', 'citations', 'panel'],
    shortcut: { key: ['b', 'B'], mod: true, shift: true }
  },
  {
    id: 'view.toggleProse',
    label: 'Toggle Prose View',
    group: 'view',
    keywords: ['markdown', 'outline', 'writing', 'visual', 'draft'],
    requiredContext: 'document',
    shortcut: { key: ['m', 'M'], mod: true, shift: true }
  },
  {
    id: 'view.toggleLog',
    label: 'Toggle Problems Panel',
    group: 'view',
    keywords: ['compile', 'output', 'errors', 'problems'],
    shortcut: { key: 'l', mod: true }
  },
  {
    id: 'view.search.citations',
    label: 'Search Citations',
    group: 'view',
    keywords: ['references', 'bibliography', 'cite'],
    shortcut: { key: ['c', 'C'], mod: true, shift: true }
  },
  {
    id: 'view.search.pdf',
    label: 'Search PDF',
    group: 'view',
    keywords: ['find', 'preview'],
    requiredContext: 'pdf',
    shortcut: { key: ['f', 'F'], mod: true, shift: true }
  },
  {
    id: 'pdf.zoomIn',
    label: 'Zoom PDF In',
    group: 'pdf',
    keywords: ['preview', 'larger'],
    requiredContext: 'pdf',
    shortcut: { key: ['=', '+'], mod: true }
  },
  {
    id: 'pdf.zoomOut',
    label: 'Zoom PDF Out',
    group: 'pdf',
    keywords: ['preview', 'smaller'],
    requiredContext: 'pdf',
    shortcut: { key: '-', mod: true }
  },
  {
    id: 'pdf.zoomReset',
    label: 'Reset PDF Zoom',
    group: 'pdf',
    keywords: ['preview', 'scale', '100%'],
    requiredContext: 'pdf'
  },
  {
    id: 'pdf.fitWidth',
    label: 'Fit PDF to Width',
    group: 'pdf',
    keywords: ['preview', 'scale', 'page'],
    requiredContext: 'pdf',
    shortcut: { key: '0', mod: true }
  },
  {
    id: 'pdf.fitHeight',
    label: 'Fit PDF to Height',
    group: 'pdf',
    keywords: ['preview', 'scale', 'page'],
    requiredContext: 'pdf',
    shortcut: { key: '9', mod: true }
  },
  {
    id: 'app.settings',
    label: 'Open Settings',
    group: 'app',
    keywords: ['preferences', 'configuration'],
    shortcut: { key: ',', mod: true }
  },
  {
    id: 'app.checkUpdates',
    label: 'Check for Updates',
    group: 'app',
    keywords: ['version', 'upgrade', 'release']
  },
  {
    id: 'app.quit',
    label: 'Quit TextEx',
    group: 'app',
    keywords: ['exit', 'close', 'application']
  },
  {
    id: 'window.close',
    label: 'Close Window',
    group: 'window',
    keywords: ['exit', 'hide']
  }
] as const satisfies readonly AppCommandDefinition[]

export type AppCommandId = (typeof APP_COMMAND_MANIFEST)[number]['id']

interface RendererShortcutDefinition {
  readonly id: string
  readonly shortcut: ShortcutBinding
}

/** Shortcuts whose handlers stay entirely inside the renderer. */
export const RENDERER_SHORTCUT_MANIFEST = [
  {
    id: 'commandPalette.open',
    shortcut: { key: ['p', 'P'], mod: true, shift: true }
  },
  { id: 'font.increase', shortcut: { key: ['=', '+'], mod: true, alt: true } },
  { id: 'font.decrease', shortcut: { key: '-', mod: true, alt: true } },
  { id: 'tab.close', shortcut: { key: 'w', mod: true } },
  { id: 'tab.prev', shortcut: { key: 'Tab', mod: true, shift: true } },
  { id: 'tab.next', shortcut: { key: 'Tab', mod: true } }
] as const satisfies readonly RendererShortcutDefinition[]

export type RendererShortcutId = (typeof RENDERER_SHORTCUT_MANIFEST)[number]['id']

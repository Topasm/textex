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

export type AppCommandCapability = 'ai' | 'documentExport' | 'pty' | 'templates'

interface AppCommandDefinition {
  readonly id: string
  readonly shortcut?: ShortcutBinding
  readonly requiredCapability?: AppCommandCapability
}

/**
 * Single source of truth for renderer-facing application command IDs.
 * Keep commands without a default shortcut in the manifest as well so
 * AppCommandId remains the complete cross-process command contract.
 */
export const APP_COMMAND_MANIFEST = [
  { id: 'file.open', shortcut: { key: 'o', mod: true } },
  { id: 'file.openFolder', shortcut: { key: 'o', mod: true, shift: true } },
  { id: 'file.save', shortcut: { key: 's', mod: true } },
  { id: 'file.saveAs', shortcut: { key: 's', mod: true, shift: true } },
  {
    id: 'file.newTemplate',
    shortcut: { key: 'n', mod: true, shift: true },
    requiredCapability: 'templates'
  },
  { id: 'file.export.html', requiredCapability: 'documentExport' },
  { id: 'file.export.docx', requiredCapability: 'documentExport' },
  { id: 'file.export.odt', requiredCapability: 'documentExport' },
  { id: 'file.export.epub', requiredCapability: 'documentExport' },
  { id: 'compile.run', shortcut: { key: 'Enter', mod: true } },
  {
    id: 'ai.draft',
    shortcut: { key: ['d', 'D'], mod: true, shift: true },
    requiredCapability: 'ai'
  },
  { id: 'edit.find', shortcut: { key: 'f', mod: true } },
  { id: 'view.toggleSidebar', shortcut: { key: 'b', mod: true } },
  { id: 'view.toggleResearchPanel', shortcut: { key: ['b', 'B'], mod: true, shift: true } },
  { id: 'view.toggleLog', shortcut: { key: 'l', mod: true } },
  {
    id: 'view.toggleTerminal',
    shortcut: { key: '`', mod: true },
    requiredCapability: 'pty'
  },
  {
    id: 'view.search.citations',
    shortcut: { key: ['c', 'C'], mod: true, shift: true }
  },
  { id: 'view.search.pdf', shortcut: { key: ['f', 'F'], mod: true, shift: true } },
  { id: 'pdf.zoomIn', shortcut: { key: ['=', '+'], mod: true } },
  { id: 'pdf.zoomOut', shortcut: { key: '-', mod: true } },
  { id: 'pdf.zoomReset' },
  { id: 'pdf.fitWidth', shortcut: { key: '0', mod: true } },
  { id: 'pdf.fitHeight', shortcut: { key: '9', mod: true } },
  { id: 'app.settings', shortcut: { key: ',', mod: true } },
  { id: 'app.checkUpdates' }
] as const satisfies readonly AppCommandDefinition[]

export type AppCommandId = (typeof APP_COMMAND_MANIFEST)[number]['id']

interface RendererShortcutDefinition {
  readonly id: string
  readonly shortcut: ShortcutBinding
}

/** Shortcuts whose handlers stay entirely inside the renderer. */
export const RENDERER_SHORTCUT_MANIFEST = [
  { id: 'font.increase', shortcut: { key: ['=', '+'], mod: true, alt: true } },
  { id: 'font.decrease', shortcut: { key: '-', mod: true, alt: true } },
  { id: 'tab.close', shortcut: { key: 'w', mod: true } },
  { id: 'tab.prev', shortcut: { key: 'Tab', mod: true, shift: true } },
  { id: 'tab.next', shortcut: { key: 'Tab', mod: true } }
] as const satisfies readonly RendererShortcutDefinition[]

export type RendererShortcutId = (typeof RENDERER_SHORTCUT_MANIFEST)[number]['id']

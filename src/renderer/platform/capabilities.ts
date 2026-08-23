export type DesktopRuntime = 'tauri'

/** Feature domains exposed by the Tauri desktop backend. */
export interface DesktopCapabilities {
  readonly runtime: DesktopRuntime
  readonly ai: boolean
  readonly citationGroups: boolean
  readonly documentExport: boolean
  readonly lsp: boolean
  readonly openExternal: boolean
  readonly performanceMemory: boolean
  readonly projectMetadata: boolean
  readonly pty: boolean
  readonly spellcheck: boolean
  readonly templates: boolean
}

const TAURI_CAPABILITIES: DesktopCapabilities = Object.freeze({
  runtime: 'tauri',
  ai: true,
  citationGroups: true,
  documentExport: true,
  lsp: true,
  openExternal: true,
  performanceMemory: true,
  projectMetadata: true,
  pty: true,
  spellcheck: true,
  templates: true
})

export function getDesktopCapabilities(): DesktopCapabilities {
  return TAURI_CAPABILITIES
}

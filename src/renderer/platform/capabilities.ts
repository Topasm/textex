export type DesktopRuntime = 'electron' | 'tauri'

/** Optional feature domains whose backends are not yet identical across runtimes. */
export interface DesktopCapabilities {
  runtime: DesktopRuntime
  ai: boolean
  citationGroups: boolean
  documentExport: boolean
  lsp: boolean
  openExternal: boolean
  performanceMemory: boolean
  projectMetadata: boolean
  pty: boolean
  spellcheck: boolean
  templates: boolean
}

const ELECTRON_CAPABILITIES: DesktopCapabilities = Object.freeze({
  runtime: 'electron',
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

const TAURI_CAPABILITIES: DesktopCapabilities = Object.freeze({
  runtime: 'tauri',
  ai: false,
  citationGroups: false,
  documentExport: false,
  lsp: false,
  openExternal: false,
  performanceMemory: false,
  projectMetadata: false,
  pty: false,
  spellcheck: false,
  templates: false
})

// Electron remains the test/legacy default. Production bootstrap always sets
// this explicitly before React mounts.
let activeCapabilities = ELECTRON_CAPABILITIES

export function configureDesktopCapabilities(runtime: DesktopRuntime): void {
  activeCapabilities = runtime === 'tauri' ? TAURI_CAPABILITIES : ELECTRON_CAPABILITIES
}

export function getDesktopCapabilities(): DesktopCapabilities {
  return activeCapabilities
}

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { IpcChannel, IpcRequest, IpcResponse } from '../shared/ipcChannels'

// ---- IPC invoke with deduplication & timeout ----

const DEFAULT_TIMEOUT_MS = 30_000
// Channels that involve user interaction (dialogs) should never time out
const NO_TIMEOUT_CHANNELS = new Set<string>([
  'fs:open', 'fs:save-as', 'fs:open-directory',
  'fs:create-template-project', 'export:convert',
  'templates:import-zip'
])

/**
 * In-flight request map for deduplication.
 * Only read-only channels are deduplicated (not writes or mutations).
 */
const DEDUP_CHANNELS = new Set<string>([
  'fs:read-file', 'fs:read-directory', 'settings:load',
  'bib:parse', 'bib:find-in-project', 'spell:check', 'spell:suggest',
  'git:is-repo', 'git:status', 'git:diff', 'git:log', 'git:file-log',
  'latex:scan-labels', 'latex:load-package-data', 'export:formats',
  'lsp:status', 'ai:has-api-key', 'structure:outline',
  'history:list', 'zotero:probe', 'zotero:search',
  'templates:list'
])

const inflight = new Map<string, Promise<unknown>>()

function makeKey(channel: string, args: unknown[]): string {
  return channel + '\0' + JSON.stringify(args)
}

/**
 * Type-safe IPC invoke with optional deduplication and timeout.
 */
function invoke<C extends IpcChannel>(
  channel: C,
  ...args: IpcRequest<C>
): Promise<IpcResponse<C>> {
  const shouldDedup = DEDUP_CHANNELS.has(channel)
  const key = shouldDedup ? makeKey(channel, args) : ''

  if (shouldDedup) {
    const existing = inflight.get(key)
    if (existing) return existing as Promise<IpcResponse<C>>
  }

  const ipcPromise = ipcRenderer.invoke(channel, ...args)

  let resultPromise: Promise<IpcResponse<C>>

  if (NO_TIMEOUT_CHANNELS.has(channel)) {
    resultPromise = ipcPromise
  } else {
    resultPromise = Promise.race([
      ipcPromise,
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`IPC call "${channel}" timed out after ${DEFAULT_TIMEOUT_MS}ms`)),
          DEFAULT_TIMEOUT_MS
        )
      })
    ])
  }

  if (shouldDedup) {
    inflight.set(key, resultPromise)
    resultPromise = resultPromise.finally(() => {
      inflight.delete(key)
    }) as Promise<IpcResponse<C>>
  }

  return resultPromise
}

// ---- Listener helpers with disposable cleanup ----

/**
 * Helper that manages a single IPC listener for a channel.
 * Automatically removes the previous handler when a new one is set.
 * Returns { on, remove } methods for use in the API bridge.
 */
function createIpcListener<TArgs extends unknown[]>(channel: string) {
  let handler: ((_event: IpcRendererEvent, ...args: TArgs) => void) | null = null
  return {
    on(cb: (...args: TArgs) => void) {
      if (handler) {
        ipcRenderer.removeListener(channel, handler)
      }
      handler = (_event: IpcRendererEvent, ...args: TArgs) => cb(...args)
      ipcRenderer.on(channel, handler)
    },
    remove() {
      if (handler) {
        ipcRenderer.removeListener(channel, handler)
        handler = null
      }
    }
  }
}

const compileLogListener = createIpcListener<[string]>('latex:log')
const diagnosticsListener = createIpcListener<[unknown[]]>('latex:diagnostics')
const directoryChangedListener =
  createIpcListener<[{ type: string; filename: string }]>('fs:directory-changed')
const lspMessageListener = createIpcListener<[object]>('lsp:message')
const lspStatusListener = createIpcListener<[string, string?]>('lsp:status-change')

let updateHandlers: Record<string, (_event: IpcRendererEvent, ...args: unknown[]) => void> = {}

contextBridge.exposeInMainWorld('api', {
  // File System
  openFile: () => invoke('fs:open'),
  saveFile: (content: string, filePath: string) => invoke('fs:save', content, filePath),
  saveFileBatch: (files: Array<{ content: string; filePath: string }>) =>
    invoke('fs:save-batch', files),
  saveFileAs: (content: string) => invoke('fs:save-as', content),
  createTemplateProject: (templateName: string, content: string) =>
    invoke('fs:create-template-project', templateName, content),
  readFile: (filePath: string) => invoke('fs:read-file', filePath),
  openDirectory: () => invoke('fs:open-directory'),
  readDirectory: (dirPath: string) => invoke('fs:read-directory', dirPath),
  createFile: (filePath: string) => invoke('fs:create-file', filePath),
  copyFile: (source: string, dest: string) => invoke('fs:copy-file', source, dest),
  createDirectory: (dirPath: string) => invoke('fs:create-directory', dirPath),
  watchDirectory: (dirPath: string) => invoke('fs:watch-directory', dirPath),
  unwatchDirectory: () => invoke('fs:unwatch-directory'),
  onDirectoryChanged: (cb: (change: { type: string; filename: string }) => void) => {
    directoryChangedListener.on(cb)
  },
  removeDirectoryChangedListener: () => {
    directoryChangedListener.remove()
  },

  // Compilation
  compile: (filePath: string) => invoke('latex:compile', filePath),
  cancelCompile: () => invoke('latex:cancel'),
  onCompileLog: (cb: (log: string) => void) => {
    compileLogListener.on(cb)
  },
  removeCompileLogListener: () => {
    compileLogListener.remove()
  },
  onDiagnostics: (cb: (diagnostics: unknown[]) => void) => {
    diagnosticsListener.on(cb)
  },
  removeDiagnosticsListener: () => {
    diagnosticsListener.remove()
  },

  // SyncTeX
  synctexForward: (texFile: string, line: number) =>
    invoke('synctex:forward', texFile, line),
  synctexInverse: (texFile: string, page: number, x: number, y: number) =>
    invoke('synctex:inverse', texFile, page, x, y),

  // Settings
  loadSettings: () => invoke('settings:load'),
  saveSettings: (partial: Record<string, unknown>) => invoke('settings:save', partial),
  addRecentProject: (projectPath: string) =>
    invoke('settings:add-recent-project', projectPath),
  removeRecentProject: (projectPath: string) =>
    invoke('settings:remove-recent-project', projectPath),
  updateRecentProject: (projectPath: string, updates: { tag?: string; pinned?: boolean }) =>
    invoke('settings:update-recent-project', projectPath, updates),

  // BibTeX
  parseBibFile: (filePath: string) => invoke('bib:parse', filePath),
  findBibInProject: (projectRoot: string) => invoke('bib:find-in-project', projectRoot),

  // Spell Check
  spellInit: (language: string) => invoke('spell:init', language),
  spellCheck: (words: string[]) => invoke('spell:check', words),
  spellSuggest: (word: string) => invoke('spell:suggest', word),
  spellAddWord: (word: string) => invoke('spell:add-word', word),
  spellSetLanguage: (language: string) => invoke('spell:set-language', language),

  // Git
  gitIsRepo: (workDir: string) => invoke('git:is-repo', workDir),
  gitInit: (workDir: string) => invoke('git:init', workDir),
  gitStatus: (workDir: string) => invoke('git:status', workDir),
  gitStage: (workDir: string, filePath: string) =>
    invoke('git:stage', workDir, filePath),
  gitUnstage: (workDir: string, filePath: string) =>
    invoke('git:unstage', workDir, filePath),
  gitCommit: (workDir: string, message: string) =>
    invoke('git:commit', workDir, message),
  gitDiff: (workDir: string) => invoke('git:diff', workDir),
  gitLog: (workDir: string) => invoke('git:log', workDir),
  gitFileLog: (workDir: string, filePath: string) =>
    invoke('git:file-log', workDir, filePath),

  // Auto Update
  updateCheck: () => invoke('update:check'),
  updateDownload: () => invoke('update:download'),
  updateInstall: () => invoke('update:install'),
  onUpdateEvent: (event: string, cb: (...args: unknown[]) => void) => {
    const channel = `update:${event}`
    if (updateHandlers[channel]) {
      ipcRenderer.removeListener(channel, updateHandlers[channel])
    }
    updateHandlers[channel] = (_event: IpcRendererEvent, ...args: unknown[]) => cb(...args)
    ipcRenderer.on(channel, updateHandlers[channel])
  },
  removeUpdateListeners: () => {
    for (const [channel, handler] of Object.entries(updateHandlers)) {
      ipcRenderer.removeListener(channel, handler)
    }
    updateHandlers = {}
  },

  // Labels
  scanLabels: (projectRoot: string) => invoke('latex:scan-labels', projectRoot),

  // Package Data
  loadPackageData: (packageNames: string[]) =>
    invoke('latex:load-package-data', packageNames),

  // Export
  exportDocument: (inputPath: string, format: string) =>
    invoke('export:convert', inputPath, format),
  getExportFormats: () => invoke('export:formats'),

  // LSP (TexLab)
  lspStart: (workspaceRoot: string) => invoke('lsp:start', workspaceRoot),
  lspStop: () => invoke('lsp:stop'),
  lspSend: (message: object) => invoke('lsp:send', message),
  lspStatus: () => invoke('lsp:status'),
  onLspMessage: (cb: (message: object) => void) => {
    lspMessageListener.on(cb)
  },
  removeLspMessageListener: () => {
    lspMessageListener.remove()
  },
  onLspStatus: (cb: (status: string, error?: string) => void) => {
    lspStatusListener.on(cb)
  },
  removeLspStatusListener: () => {
    lspStatusListener.remove()
  },

  // Zotero
  zoteroProbe: (port?: number) => invoke('zotero:probe', port),
  zoteroSearch: (term: string, port?: number) => invoke('zotero:search', term, port),
  zoteroCiteCAYW: (port?: number) => invoke('zotero:cite-cayw', port),
  zoteroExportBibtex: (citekeys: string[], port?: number) =>
    invoke('zotero:export-bibtex', citekeys, port),

  // Citation Groups
  loadCitationGroups: (projectRoot: string) => invoke('citgroups:load', projectRoot),
  saveCitationGroups: (
    projectRoot: string,
    groups: { id: string; name: string; citekeys: string[] }[]
  ) => invoke('citgroups:save', projectRoot, groups),

  // AI Draft
  aiGenerate: (input: string, provider: string, model: string) =>
    invoke('ai:generate', input, provider, model),
  aiSaveApiKey: (provider: string, apiKey: string) =>
    invoke('ai:save-api-key', provider, apiKey),
  aiHasApiKey: (provider: string) => invoke('ai:has-api-key', provider),
  aiProcess: (action: 'fix' | 'academic' | 'summarize' | 'longer' | 'shorter', text: string) =>
    invoke('ai:process', action, text),

  // Document Structure (fallback outline)
  getDocumentOutline: (filePath: string, content: string) =>
    invoke('structure:outline', filePath, content),

  // Shell
  openExternal: (url: string) => invoke('shell:open-external', url),

  // History
  saveHistorySnapshot: (filePath: string, content: string) =>
    invoke('history:save', filePath, content),
  getHistoryList: (filePath: string) => invoke('history:list', filePath),
  loadHistorySnapshot: (snapshotPath: string) => invoke('history:load', snapshotPath),

  // Templates
  listTemplates: () => invoke('templates:list'),
  addTemplate: (name: string, description: string, content: string) =>
    invoke('templates:add', name, description, content),
  removeTemplate: (id: string) => invoke('templates:remove', id),
  importTemplateZip: () => invoke('templates:import-zip')
})

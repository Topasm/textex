import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

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
const directoryChangedListener = createIpcListener<[{ type: string; filename: string }]>('fs:directory-changed')
const lspMessageListener = createIpcListener<[object]>('lsp:message')
const lspStatusListener = createIpcListener<[string, string?]>('lsp:status-change')

let updateHandlers: Record<string, ((_event: IpcRendererEvent, ...args: unknown[]) => void)> = {}

contextBridge.exposeInMainWorld('api', {
  // File System
  openFile: () => ipcRenderer.invoke('fs:open'),
  saveFile: (content: string, filePath: string) => ipcRenderer.invoke('fs:save', content, filePath),
  saveFileBatch: (files: Array<{ content: string; filePath: string }>) => ipcRenderer.invoke('fs:save-batch', files),
  saveFileAs: (content: string) => ipcRenderer.invoke('fs:save-as', content),
  createTemplateProject: (templateName: string, content: string) =>
    ipcRenderer.invoke('fs:create-template-project', templateName, content),
  readFile: (filePath: string) => ipcRenderer.invoke('fs:read-file', filePath),
  openDirectory: () => ipcRenderer.invoke('fs:open-directory'),
  readDirectory: (dirPath: string) => ipcRenderer.invoke('fs:read-directory', dirPath),
  createFile: (filePath: string) => ipcRenderer.invoke('fs:create-file', filePath),
  copyFile: (source: string, dest: string) => ipcRenderer.invoke('fs:copy-file', source, dest),
  createDirectory: (dirPath: string) => ipcRenderer.invoke('fs:create-directory', dirPath),
  watchDirectory: (dirPath: string) => ipcRenderer.invoke('fs:watch-directory', dirPath),
  unwatchDirectory: () => ipcRenderer.invoke('fs:unwatch-directory'),
  onDirectoryChanged: (cb: (change: { type: string; filename: string }) => void) => {
    directoryChangedListener.on(cb)
  },
  removeDirectoryChangedListener: () => {
    directoryChangedListener.remove()
  },

  // Compilation
  compile: (filePath: string) => ipcRenderer.invoke('latex:compile', filePath),
  cancelCompile: () => ipcRenderer.invoke('latex:cancel'),
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
    ipcRenderer.invoke('synctex:forward', texFile, line),
  synctexInverse: (texFile: string, page: number, x: number, y: number) =>
    ipcRenderer.invoke('synctex:inverse', texFile, page, x, y),

  // Settings
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (partial: Record<string, unknown>) =>
    ipcRenderer.invoke('settings:save', partial),
  addRecentProject: (projectPath: string) =>
    ipcRenderer.invoke('settings:add-recent-project', projectPath),
  removeRecentProject: (projectPath: string) =>
    ipcRenderer.invoke('settings:remove-recent-project', projectPath),
  updateRecentProject: (projectPath: string, updates: { tag?: string; pinned?: boolean }) =>
    ipcRenderer.invoke('settings:update-recent-project', projectPath, updates),

  // BibTeX
  parseBibFile: (filePath: string) => ipcRenderer.invoke('bib:parse', filePath),
  findBibInProject: (projectRoot: string) =>
    ipcRenderer.invoke('bib:find-in-project', projectRoot),

  // Spell Check
  spellInit: (language: string) => ipcRenderer.invoke('spell:init', language),
  spellCheck: (words: string[]) => ipcRenderer.invoke('spell:check', words),
  spellSuggest: (word: string) => ipcRenderer.invoke('spell:suggest', word),
  spellAddWord: (word: string) => ipcRenderer.invoke('spell:add-word', word),
  spellSetLanguage: (language: string) => ipcRenderer.invoke('spell:set-language', language),

  // Git
  gitIsRepo: (workDir: string) => ipcRenderer.invoke('git:is-repo', workDir),
  gitInit: (workDir: string) => ipcRenderer.invoke('git:init', workDir),
  gitStatus: (workDir: string) => ipcRenderer.invoke('git:status', workDir),
  gitStage: (workDir: string, filePath: string) =>
    ipcRenderer.invoke('git:stage', workDir, filePath),
  gitUnstage: (workDir: string, filePath: string) =>
    ipcRenderer.invoke('git:unstage', workDir, filePath),
  gitCommit: (workDir: string, message: string) =>
    ipcRenderer.invoke('git:commit', workDir, message),
  gitDiff: (workDir: string) => ipcRenderer.invoke('git:diff', workDir),
  gitLog: (workDir: string) => ipcRenderer.invoke('git:log', workDir),
  gitFileLog: (workDir: string, filePath: string) =>
    ipcRenderer.invoke('git:file-log', workDir, filePath),

  // Auto Update
  updateCheck: () => ipcRenderer.invoke('update:check'),
  updateDownload: () => ipcRenderer.invoke('update:download'),
  updateInstall: () => ipcRenderer.invoke('update:install'),
  onUpdateEvent: (
    event: string,
    cb: (...args: unknown[]) => void
  ) => {
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
  scanLabels: (projectRoot: string) =>
    ipcRenderer.invoke('latex:scan-labels', projectRoot),

  // Package Data
  loadPackageData: (packageNames: string[]) =>
    ipcRenderer.invoke('latex:load-package-data', packageNames),

  // Export
  exportDocument: (inputPath: string, format: string) =>
    ipcRenderer.invoke('export:convert', inputPath, format),
  getExportFormats: () => ipcRenderer.invoke('export:formats'),

  // LSP (TexLab)
  lspStart: (workspaceRoot: string) => ipcRenderer.invoke('lsp:start', workspaceRoot),
  lspStop: () => ipcRenderer.invoke('lsp:stop'),
  lspSend: (message: object) => ipcRenderer.invoke('lsp:send', message),
  lspStatus: () => ipcRenderer.invoke('lsp:status'),
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
  zoteroProbe: (port?: number) => ipcRenderer.invoke('zotero:probe', port),
  zoteroSearch: (term: string, port?: number) => ipcRenderer.invoke('zotero:search', term, port),
  zoteroCiteCAYW: (port?: number) => ipcRenderer.invoke('zotero:cite-cayw', port),
  zoteroExportBibtex: (citekeys: string[], port?: number) =>
    ipcRenderer.invoke('zotero:export-bibtex', citekeys, port),

  // Citation Groups
  loadCitationGroups: (projectRoot: string) =>
    ipcRenderer.invoke('citgroups:load', projectRoot),
  saveCitationGroups: (projectRoot: string, groups: { id: string; name: string; citekeys: string[] }[]) =>
    ipcRenderer.invoke('citgroups:save', projectRoot, groups),

  // AI Draft
  aiGenerate: (input: string, provider: string, model: string) =>
    ipcRenderer.invoke('ai:generate', input, provider, model),
  aiSaveApiKey: (provider: string, apiKey: string) =>
    ipcRenderer.invoke('ai:save-api-key', provider, apiKey),
  aiHasApiKey: (provider: string) => ipcRenderer.invoke('ai:has-api-key', provider),
  aiProcess: (action: 'fix' | 'academic' | 'summarize' | 'longer' | 'shorter', text: string) =>
    ipcRenderer.invoke('ai:process', action, text),

  // Document Structure (fallback outline)
  getDocumentOutline: (filePath: string, content: string) => ipcRenderer.invoke('structure:outline', filePath, content),

  // Shell
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),

  // History
  saveHistorySnapshot: (filePath: string, content: string) => ipcRenderer.invoke('history:save', filePath, content),
  getHistoryList: (filePath: string) => ipcRenderer.invoke('history:list', filePath),
  loadHistorySnapshot: (snapshotPath: string) => ipcRenderer.invoke('history:load', snapshotPath)
})

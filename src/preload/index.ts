import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

let compileLogHandler: ((_event: IpcRendererEvent, log: string) => void) | null = null
let diagnosticsHandler: ((_event: IpcRendererEvent, diagnostics: unknown[]) => void) | null = null
let directoryChangedHandler: (
  (_event: IpcRendererEvent, change: { type: string; filename: string }) => void
) | null = null
let updateHandlers: Record<string, ((_event: IpcRendererEvent, ...args: unknown[]) => void)> = {}

contextBridge.exposeInMainWorld('api', {
  // File System
  openFile: () => ipcRenderer.invoke('fs:open'),
  saveFile: (content: string, filePath: string) => ipcRenderer.invoke('fs:save', content, filePath),
  saveFileAs: (content: string) => ipcRenderer.invoke('fs:save-as', content),
  readFile: (filePath: string) => ipcRenderer.invoke('fs:read-file', filePath),
  openDirectory: () => ipcRenderer.invoke('fs:open-directory'),
  readDirectory: (dirPath: string) => ipcRenderer.invoke('fs:read-directory', dirPath),
  watchDirectory: (dirPath: string) => ipcRenderer.invoke('fs:watch-directory', dirPath),
  unwatchDirectory: () => ipcRenderer.invoke('fs:unwatch-directory'),
  onDirectoryChanged: (cb: (change: { type: string; filename: string }) => void) => {
    if (directoryChangedHandler) {
      ipcRenderer.removeListener('fs:directory-changed', directoryChangedHandler)
    }
    directoryChangedHandler = (
      _event: IpcRendererEvent,
      change: { type: string; filename: string }
    ) => cb(change)
    ipcRenderer.on('fs:directory-changed', directoryChangedHandler)
  },
  removeDirectoryChangedListener: () => {
    if (directoryChangedHandler) {
      ipcRenderer.removeListener('fs:directory-changed', directoryChangedHandler)
      directoryChangedHandler = null
    }
  },

  // Compilation
  compile: (filePath: string) => ipcRenderer.invoke('latex:compile', filePath),
  cancelCompile: () => ipcRenderer.invoke('latex:cancel'),
  onCompileLog: (cb: (log: string) => void) => {
    if (compileLogHandler) {
      ipcRenderer.removeListener('latex:log', compileLogHandler)
    }
    compileLogHandler = (_event: IpcRendererEvent, log: string) => cb(log)
    ipcRenderer.on('latex:log', compileLogHandler)
  },
  removeCompileLogListener: () => {
    if (compileLogHandler) {
      ipcRenderer.removeListener('latex:log', compileLogHandler)
      compileLogHandler = null
    }
  },
  onDiagnostics: (cb: (diagnostics: unknown[]) => void) => {
    if (diagnosticsHandler) {
      ipcRenderer.removeListener('latex:diagnostics', diagnosticsHandler)
    }
    diagnosticsHandler = (_event: IpcRendererEvent, diagnostics: unknown[]) => cb(diagnostics)
    ipcRenderer.on('latex:diagnostics', diagnosticsHandler)
  },
  removeDiagnosticsListener: () => {
    if (diagnosticsHandler) {
      ipcRenderer.removeListener('latex:diagnostics', diagnosticsHandler)
      diagnosticsHandler = null
    }
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
  getExportFormats: () => ipcRenderer.invoke('export:formats')
})

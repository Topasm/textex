import {
  Diagnostic,
  SyncTeXForwardResult,
  SyncTeXInverseResult,
  DirectoryEntry,
  BibEntry,
  GitFileStatus,
  GitLogEntry,
  UserSettings,
  LabelInfo,
  PackageData,
  CitationGroup,
  ZoteroSearchResult,
  DocumentSymbolNode
} from '../../shared/types'

export interface OpenFileResult {
  content: string
  filePath: string
}

export interface SaveResult {
  success: boolean
}

export interface SaveAsResult {
  filePath: string
}

export interface CompileResult {
  pdfBase64: string
}

export interface GitStatusResult {
  branch: string
  files: GitFileStatus[]
  staged: string[]
  modified: string[]
  not_added: string[]
}

export interface ElectronAPI {
  // File System
  openFile(): Promise<OpenFileResult | null>
  saveFile(content: string, filePath: string): Promise<SaveResult>
  saveFileAs(content: string): Promise<SaveAsResult | null>
  readFile(filePath: string): Promise<OpenFileResult>
  openDirectory(): Promise<string | null>
  readDirectory(dirPath: string): Promise<DirectoryEntry[]>
  watchDirectory(dirPath: string): Promise<{ success: boolean }>
  unwatchDirectory(): Promise<{ success: boolean }>
  onDirectoryChanged(cb: (change: { type: string; filename: string }) => void): void
  removeDirectoryChangedListener(): void

  // Compilation
  compile(filePath: string): Promise<CompileResult>
  cancelCompile(): Promise<boolean>
  onCompileLog(cb: (log: string) => void): void
  removeCompileLogListener(): void
  onDiagnostics(cb: (diagnostics: Diagnostic[]) => void): void
  removeDiagnosticsListener(): void

  // SyncTeX
  synctexForward(texFile: string, line: number): Promise<SyncTeXForwardResult | null>
  synctexInverse(
    texFile: string,
    page: number,
    x: number,
    y: number
  ): Promise<SyncTeXInverseResult | null>

  // Settings
  loadSettings(): Promise<UserSettings>
  saveSettings(partial: Partial<UserSettings>): Promise<UserSettings>

  // BibTeX
  parseBibFile(filePath: string): Promise<BibEntry[]>
  findBibInProject(projectRoot: string): Promise<BibEntry[]>

  // Labels
  scanLabels(projectRoot: string): Promise<LabelInfo[]>

  // Package Data
  loadPackageData(packageNames: string[]): Promise<Record<string, PackageData>>

  // Spell Check
  spellInit(language: string): Promise<{ success: boolean }>
  spellCheck(words: string[]): Promise<string[]>
  spellSuggest(word: string): Promise<string[]>
  spellAddWord(word: string): Promise<{ success: boolean }>
  spellSetLanguage(language: string): Promise<{ success: boolean }>

  // Git
  gitIsRepo(workDir: string): Promise<boolean>
  gitInit(workDir: string): Promise<{ success: boolean }>
  gitStatus(workDir: string): Promise<GitStatusResult>
  gitStage(workDir: string, filePath: string): Promise<{ success: boolean }>
  gitUnstage(workDir: string, filePath: string): Promise<{ success: boolean }>
  gitCommit(workDir: string, message: string): Promise<{ success: boolean }>
  gitDiff(workDir: string): Promise<string>
  gitLog(workDir: string): Promise<GitLogEntry[]>

  // Auto Update
  updateCheck(): Promise<{ success: boolean; error?: string }>
  updateDownload(): Promise<{ success: boolean; error?: string }>
  updateInstall(): Promise<{ success: boolean; error?: string }>
  onUpdateEvent(event: string, cb: (...args: unknown[]) => void): void
  removeUpdateListeners(): void

  // Export
  exportDocument(
    inputPath: string,
    format: string
  ): Promise<{ success: boolean; outputPath: string } | null>
  getExportFormats(): Promise<{ name: string; ext: string }[]>

  // LSP (TexLab)
  lspStart(workspaceRoot: string): Promise<{ success: boolean }>
  lspStop(): Promise<{ success: boolean }>
  lspSend(message: object): Promise<{ success: boolean }>
  lspStatus(): Promise<{ status: string }>
  onLspMessage(cb: (message: object) => void): void
  removeLspMessageListener(): void
  onLspStatus(cb: (status: string, error?: string) => void): void
  removeLspStatusListener(): void

  // Zotero
  zoteroProbe(port?: number): Promise<boolean>
  zoteroSearch(term: string, port?: number): Promise<ZoteroSearchResult[]>
  zoteroCiteCAYW(port?: number): Promise<string>
  zoteroExportBibtex(citekeys: string[], port?: number): Promise<string>

  // Citation Groups
  loadCitationGroups(projectRoot: string): Promise<CitationGroup[]>
  saveCitationGroups(projectRoot: string, groups: CitationGroup[]): Promise<{ success: boolean }>

  // AI Draft
  aiGenerate(input: string, provider: string, model: string): Promise<{ latex: string }>
  aiSaveApiKey(provider: string, apiKey: string): Promise<{ success: boolean }>
  aiHasApiKey(provider: string): Promise<boolean>

  // Shell
  openExternal(url: string): Promise<{ success: boolean }>
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}

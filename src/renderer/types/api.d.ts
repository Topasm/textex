interface OpenFileResult {
  content: string
  filePath: string
}

interface SaveResult {
  success: boolean
}

interface SaveAsResult {
  filePath: string
}

interface CompileResult {
  pdfBase64: string
}

interface DirectoryEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: DirectoryEntry[]
}

interface BibEntry {
  key: string
  type: string
  title: string
  author: string
  year: string
  journal?: string
}

interface GitFileStatus {
  path: string
  index: string
  working_dir: string
}

interface GitStatusResult {
  branch: string
  files: GitFileStatus[]
  staged: string[]
  modified: string[]
  not_added: string[]
}

interface GitLogEntry {
  hash: string
  date: string
  message: string
  author: string
}

interface UserSettings {
  theme: 'dark' | 'light' | 'high-contrast'
  fontSize: number
  autoCompile: boolean
  spellCheckEnabled: boolean
  spellCheckLanguage: string
  gitEnabled: boolean
  autoUpdateEnabled: boolean
}

interface ElectronAPI {
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
}

declare global {
  type DiagnosticSeverity = 'error' | 'warning' | 'info'

  interface Diagnostic {
    file: string
    line: number
    column?: number
    severity: DiagnosticSeverity
    message: string
  }

  interface SyncTeXForwardResult {
    page: number
    x: number
    y: number
  }

  interface SyncTeXInverseResult {
    file: string
    line: number
    column: number
  }

  interface Window {
    api: ElectronAPI
  }
}

export {}

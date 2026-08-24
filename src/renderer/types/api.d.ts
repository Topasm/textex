import {
  AppCommandId,
  AiContextEntry,
  AiCustomProcessRequest,
  AiProcessRequest,
  ResearchChatRequest,
  ZoteroPlanRequest,
  ZoteroMutationPlan,
  ZoteroMutationResult,
  ResearchChatSession,
  ResearchChatSessionScope,
  ResearchChatSessionSnapshot,
  ClaudeTerminalRequest,
  ClaudeTerminalResult,
  CodexTerminalRequest,
  CodexTerminalResult,
  SyncTeXForwardResult,
  SyncTeXInverseResult,
  SyncTeXLineMapEntry,
  DirectoryEntry,
  DirectoryChangeEvent,
  ProjectIndexSnapshot,
  BibEntry,
  GitFileStatus,
  GitLogEntry,
  UserSettings,
  RecentProjectUpdates,
  LabelInfo,
  PackageData,
  CitationGroup,
  ZoteroSearchResult,
  ZoteroSyncResult,
  ZoteroSaveResult,
  ZoteroCollection,
  OnlineReference,
  ReferenceAddResult,
  ResearchConfig,
  ResearchProfile,
  ResearchResourceSnapshot,
  ResearchSourceIndex,
  ResearchSourceGitResult,
  ResearchSourceSearchResult,
  HistoryItem,
  RecoveryItem,
  RecoverySnapshot,
  SectionNode,
  ProjectDatabase,
  CompileDatabase,
  CompileRecord,
  ProjectSnippet,
  ProjectBookmark,
  AppUpdateActionResult,
  AppUpdateCheckResult,
  AppUpdateDownloadProgress,
  TectonicCacheStatus
} from '../../shared/types'
import { Template } from '../../shared/templates'
import type { PerformanceMemorySample, RuntimePerformanceReport } from '../../shared/performance'
import type {
  CompileDiagnosticsEvent,
  CompileLogEvent,
  CompileRequest,
  CompileResponse
} from '../../shared/compileProtocol'

export interface OpenFileResult {
  content: string
  filePath: string
  warnLargeFile?: boolean
}

export interface SaveResult {
  success: boolean
}

export interface SaveAsResult {
  filePath: string
}

export interface GitStatusResult {
  branch: string
  files: GitFileStatus[]
  staged: string[]
  modified: string[]
  not_added: string[]
}

/** Typed renderer boundary implemented by the Tauri adapter. */
export interface DesktopApi {
  // File System
  openFile(): Promise<OpenFileResult | null>
  saveFile(content: string, filePath: string): Promise<SaveResult>
  /** Imports bytes without JSON expansion and returns the collision-safe destination path. */
  writeFileBinary(filePath: string, data: Uint8Array): Promise<SaveAsResult>
  saveFileBatch(files: Array<{ content: string; filePath: string }>): Promise<SaveResult>
  saveFileAs(content: string): Promise<SaveAsResult | null>
  createTemplateProject(
    templateName: string,
    content: string,
    files?: Record<string, string>
  ): Promise<{ projectPath: string; filePath: string } | null>
  readFile(filePath: string): Promise<OpenFileResult>
  openDirectory(): Promise<string | null>
  /** Activates a dialog-authorized or native-persisted recent project root. */
  activateProject(projectPath: string): Promise<string>
  /** Returns the native project authority after an activation attempt. */
  getActiveProject(): Promise<string | null>
  /** Closes the trusted project session and all native project resources. */
  deactivateProject(): Promise<{ success: boolean }>
  createFile(filePath: string): Promise<{ success: boolean }>
  createDirectory(dirPath: string): Promise<{ success: boolean }>
  copyFile(source: string, dest: string): Promise<{ success: boolean }>
  renamePath(source: string, destination: string): Promise<{ success: boolean }>
  deletePath(path: string): Promise<{ success: boolean }>
  readFileBase64(filePath: string): Promise<{ data: string; mimeType: string }>
  readFileBinary(filePath: string): Promise<{ data: Uint8Array; mimeType: string }>
  readDirectory(dirPath: string): Promise<DirectoryEntry[]>
  watchDirectory(dirPath: string): Promise<{ success: boolean }>
  unwatchDirectory(): Promise<{ success: boolean }>
  onDirectoryChanged(cb: (change: DirectoryChangeEvent) => void): void
  removeDirectoryChangedListener(): void
  /** Lazily builds or restores the native flat project metadata index. */
  getProjectIndex(): Promise<ProjectIndexSnapshot>

  // Compilation
  compile(request: CompileRequest): Promise<CompileResponse>
  cancelCompile(): Promise<boolean>
  tectonicCacheStatus(): Promise<TectonicCacheStatus>
  tectonicCacheReset(): Promise<TectonicCacheStatus>
  onCompileLog(cb: (event: CompileLogEvent) => void): void
  removeCompileLogListener(): void
  onDiagnostics(cb: (event: CompileDiagnosticsEvent) => void): void
  removeDiagnosticsListener(): void

  // SyncTeX
  synctexForward(texFile: string, line: number): Promise<SyncTeXForwardResult | null>
  synctexInverse(
    texFile: string,
    page: number,
    x: number,
    y: number
  ): Promise<SyncTeXInverseResult | null>
  synctexBuildLineMap(texFile: string): Promise<SyncTeXLineMapEntry[]>

  // Settings
  loadSettings(): Promise<UserSettings>
  saveSettings(partial: Partial<UserSettings>): Promise<UserSettings>
  setTheme(theme: UserSettings['theme']): Promise<void>
  addRecentProject(projectPath: string): Promise<UserSettings>
  removeRecentProject(projectPath: string): Promise<UserSettings>
  updateRecentProject(projectPath: string, updates: RecentProjectUpdates): Promise<UserSettings>

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
  gitFileLog(workDir: string, filePath: string): Promise<GitLogEntry[]>

  // Auto Update
  updateCheck(): Promise<AppUpdateCheckResult>
  updateDownload(
    onProgress?: (progress: AppUpdateDownloadProgress) => void
  ): Promise<AppUpdateActionResult>
  updateInstall(): Promise<AppUpdateActionResult>
  onAppCommand(cb: (command: AppCommandId) => void): void
  removeAppCommandListener(): void
  requestWindowClose(): Promise<void>
  exitApp(): Promise<{ success: boolean }>
  onWindowCloseRequested(cb: () => boolean | Promise<boolean>): void
  removeWindowCloseRequestedListener(): void

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
  zoteroSyncCollection(
    collection: string,
    targetFile?: string,
    port?: number
  ): Promise<ZoteroSyncResult>
  zoteroCollections(port?: number): Promise<ZoteroCollection[]>
  zoteroAddToProject(citekey: string, port?: number): Promise<ReferenceAddResult>
  zoteroSaveOnline(reference: OnlineReference, port?: number): Promise<ZoteroSaveResult>
  zoteroApplyMutationPlan(plan: ZoteroMutationPlan): Promise<ZoteroMutationResult>
  researchSearchOnline(query: string): Promise<OnlineReference[]>
  researchAddOnline(reference: OnlineReference): Promise<ReferenceAddResult>
  researchLoadConfig(): Promise<ResearchConfig>
  researchSaveConfig(config: ResearchConfig): Promise<ResearchConfig>
  researchProfileLoad(): Promise<ResearchProfile>
  researchProfileSave(profile: ResearchProfile): Promise<ResearchProfile>
  researchChatSessionLoad(): Promise<ResearchChatSessionSnapshot>
  researchChatSessionSave(
    scope: ResearchChatSessionScope,
    session: ResearchChatSession
  ): Promise<ResearchChatSessionSnapshot>
  researchChatSessionClear(scope: ResearchChatSessionScope): Promise<ResearchChatSessionSnapshot>
  researchResourceSnapshot(resourceId: string): Promise<ResearchResourceSnapshot>
  researchSourceIndex(resourceId: string, localPath: string): Promise<ResearchSourceIndex>
  researchSourceSearch(
    resourceId: string,
    query: string,
    limit?: number
  ): Promise<ResearchSourceSearchResult[]>
  researchSourceClone(resourceId: string): Promise<ResearchSourceGitResult>
  researchSourceFetch(resourceId: string): Promise<ResearchSourceGitResult>

  // Citation Groups
  loadCitationGroups(projectRoot: string): Promise<CitationGroup[]>
  saveCitationGroups(projectRoot: string, groups: CitationGroup[]): Promise<{ success: boolean }>

  // AI Draft
  aiGenerate(input: string, provider: string, model: string): Promise<{ latex: string }>
  aiSaveApiKey(provider: string, apiKey: string): Promise<{ success: boolean }>
  aiHasApiKey(provider: string): Promise<boolean>
  aiProcess(request: AiProcessRequest): Promise<string>
  aiProcessCustom(request: AiCustomProcessRequest): Promise<string>
  aiResearchChat(request: ResearchChatRequest): Promise<string>
  aiPlanZotero(request: ZoteroPlanRequest, port?: number): Promise<ZoteroMutationPlan>
  aiUpdateContext(filePath: string, content: string): Promise<AiContextEntry>
  aiCheckCli(): Promise<boolean>
  aiCheckCodexCli(): Promise<boolean>
  aiOpenClaudeTerminal(request: ClaudeTerminalRequest): Promise<ClaudeTerminalResult>
  aiOpenCodexTerminal(request: CodexTerminalRequest): Promise<CodexTerminalResult>

  // PTY (embedded terminal)
  ptyCreate(options: {
    cwd: string
    cols?: number
    rows?: number
    shell?: string
    env?: Record<string, string>
  }): Promise<{ id: string }>
  ptyWrite(id: string, data: string): Promise<{ success: boolean }>
  ptyResize(id: string, cols: number, rows: number): Promise<{ success: boolean }>
  ptyDispose(id: string): Promise<{ success: boolean }>
  onPtyData(id: string, cb: (data: string) => void): () => void
  onPtyExit(id: string, cb: (exitCode: number, signal: number | null) => void): () => void

  // Document Structure (fallback outline)
  getDocumentOutline(filePath: string, content: string): Promise<SectionNode[]>

  // Shell
  openExternal(url: string): Promise<{ success: boolean }>

  // Performance diagnostics
  getPerformanceMemory(): Promise<PerformanceMemorySample>

  // History
  saveHistorySnapshot(filePath: string, content: string): Promise<void>
  getHistoryList(filePath: string): Promise<HistoryItem[]>
  loadHistorySnapshot(filePath: string, snapshotPath: string): Promise<string>

  // Unsaved document crash recovery (native app-local data)
  saveRecoverySnapshot(filePath: string, content: string): Promise<void>
  listRecoverySnapshots(): Promise<RecoveryItem[]>
  loadRecoverySnapshot(id: string): Promise<RecoverySnapshot>
  discardRecoverySnapshot(id: string): Promise<void>
  clearRecoverySnapshot(filePath: string): Promise<void>

  // Templates
  listTemplates(): Promise<Template[]>
  addTemplate(name: string, description: string, content: string): Promise<Template>
  removeTemplate(id: string): Promise<{ success: boolean }>
  importTemplateZip(): Promise<Template | null>

  // Project Data (.textex/ folder)
  projectInit(projectRoot: string): Promise<ProjectDatabase>
  projectExists(projectRoot: string): Promise<boolean>
  projectLoad(projectRoot: string): Promise<ProjectDatabase>
  projectSave(projectRoot: string, partial: Partial<ProjectDatabase>): Promise<ProjectDatabase>
  projectTouch(projectRoot: string): Promise<{ success: boolean }>
  projectCompileLoad(projectRoot: string): Promise<CompileDatabase>
  projectCompileSave(projectRoot: string, record: CompileRecord): Promise<CompileDatabase>
  projectCompileClear(projectRoot: string): Promise<CompileDatabase>
  projectCompileLogSave(projectRoot: string, filePath: string, log: string): Promise<string>
  projectCompileLogLoad(projectRoot: string, filePath: string): Promise<string | null>
  projectSnippetsLoad(projectRoot: string): Promise<ProjectSnippet[]>
  projectSnippetsAdd(
    projectRoot: string,
    snippet: Omit<ProjectSnippet, 'id'>
  ): Promise<ProjectSnippet>
  projectSnippetsRemove(projectRoot: string, id: string): Promise<{ success: boolean }>
  projectBookmarksLoad(projectRoot: string): Promise<ProjectBookmark[]>
  projectBookmarksAdd(
    projectRoot: string,
    bookmark: Omit<ProjectBookmark, 'id' | 'created'>
  ): Promise<ProjectBookmark>
  projectBookmarksRemove(projectRoot: string, id: string): Promise<{ success: boolean }>
}

declare global {
  interface Window {
    api: DesktopApi
    textexPerformance?: {
      enabled: true
      report(): Promise<RuntimePerformanceReport>
      download(): Promise<RuntimePerformanceReport>
      reset(): void
      captureMemory(): Promise<void>
    }
  }
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info'

export interface Diagnostic {
  file: string
  line: number
  column?: number
  severity: DiagnosticSeverity
  message: string
}

export type { AppCommandId } from './appCommandManifest'

export interface SyncTeXForwardResult {
  page: number
  x: number
  y: number
}

export interface SyncTeXInverseResult {
  file: string
  line: number
  column: number
}

export interface SyncTeXLineMapEntry {
  line: number
  page: number
  y: number
}

export interface DirectoryEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: DirectoryEntry[]
}

export interface DirectoryChangeEvent {
  type: 'change' | 'rename'
  /** Project-root-relative path emitted by the native directory watcher. */
  filename: string
  indexDelta?: ProjectIndexDelta
  /** The native incremental index failed and must be loaded again authoritatively. */
  indexInvalidated?: boolean
}

export interface ProjectIndexEntry {
  path: string
  relativePath: string
  parentRelativePath: string
  name: string
  type: 'file' | 'directory'
  size?: number
  modifiedMs?: number
}

export interface ProjectIndexSnapshot {
  root: string
  generation: number
  entries: ProjectIndexEntry[]
}

export interface ProjectIndexDelta {
  generation: number
  upserted: ProjectIndexEntry[]
  removedPaths: string[]
}

export interface BibEntry {
  key: string
  type: string
  title: string
  author: string
  year: string
  journal?: string
  doi?: string
  arxivId?: string
  file?: string
  line?: number
}

export interface CitationUsage {
  citekey: string
  count: number
  locations?: CitationLocation[]
}

export interface CitationLocation {
  file: string
  line: number
}

export interface GitFileStatus {
  path: string
  index: string
  working_dir: string
}

export interface GitLogEntry {
  hash: string
  date: string
  message: string
  author: string
}

export type SectionLevel = 0 | 1 | 2 | 3
// 0=chapter, 1=section, 2=subsection, 3=subsubsection
export type DocumentSemanticKind = 'section' | 'frontmatter' | 'other'

export interface SectionNode {
  title: string
  level: SectionLevel
  starred: boolean
  file: string
  startLine: number
  endLine: number
  semanticKind?: DocumentSemanticKind
  children: SectionNode[]
}

export interface DocumentSymbolNode {
  name: string
  detail: string
  kind: number // Monaco-compatible symbol kind
  range: { startLine: number; startColumn: number; endLine: number; endColumn: number }
  selectionRange: { startLine: number; startColumn: number; endLine: number; endColumn: number }
  semanticKind?: DocumentSemanticKind
  children: DocumentSymbolNode[]
}

export interface DocumentMetadata {
  documentClass: string
  documentClassOptions: string[]
  title: string | null
  author: string | null
  date: string | null
  abstract: string | null
  packages: string[]
  mainFile: string
}

export interface DocumentStructure {
  metadata: DocumentMetadata
  outline: SectionNode[]
  files: string[]
}

export interface PaperInfo {
  mainFile: string
  title: string
  documentClass: string
}

export interface LabelInfo {
  label: string
  file: string
  line: number
  context: string
}

export interface PackageMacro {
  name: string
  snippet?: string
  detail?: string
}

export interface PackageEnv {
  name: string
  argSnippet?: string
}

export interface PackageData {
  macros: PackageMacro[]
  envs: PackageEnv[]
  deps: string[]
}

export interface RecentProject {
  path: string
  name: string
  lastOpened: string
  title?: string
  tag?: string
  pinned?: boolean
}

export interface RecentProjectUpdates {
  path?: string
  tag?: string
  pinned?: boolean
}

export interface RendererSessionSnapshot {
  version: 1
  editor?: string
  project?: string
  pdf?: string
}

export interface AppUpdateMetadata {
  currentVersion: string
  version: string
  date?: string
  body?: string
}

export type AppUpdateCheckResult =
  { success: true; update: AppUpdateMetadata | null } | { success: false; error: string }

export interface AppUpdateDownloadProgress {
  downloaded: number
  contentLength: number | null
  percent: number | null
}

export type AppUpdateActionResult = { success: true } | { success: false; error: string }

export interface UserSettings {
  theme: 'system' | 'dark' | 'light' | 'high-contrast' | 'glass'
  fontSize: number
  latexEngine: 'tectonic' | 'pdf-latex'
  autoCompile: boolean
  watchOpenFiles: boolean
  spellCheckEnabled: boolean
  spellCheckLanguage: string
  gitEnabled: boolean
  autoUpdateEnabled: boolean
  zoteroEnabled: boolean
  zoteroPort: number
  zoteroCollection: string
  citeOnlineToZotero: boolean
  aiEnabled?: boolean
  aiProvider: 'openai' | 'anthropic' | 'gemini' | 'claude-cli' | 'codex-cli' | ''
  aiApiKey?: string
  aiModel: string
  aiThinkingEnabled?: boolean
  aiThinkingBudget?: number
  aiPromptGenerate?: string
  aiPromptFix?: string
  aiPromptAcademic?: string
  aiPromptSummarize?: string
  aiPromptLonger?: string
  aiPromptShorter?: string
  wordWrap?: boolean
  vimMode?: boolean
  formatOnSave?: boolean
  mathPreviewEnabled?: boolean
  pdfInvertMode?: boolean
  autoHideSidebar?: boolean
  showStatusBar?: boolean
  sectionHighlightEnabled?: boolean
  sectionHighlightColors?: string[]
  bibGroupMode?: 'flat' | 'author' | 'year' | 'type' | 'custom'
  lineNumbers?: boolean
  tabSize?: number
  recentProjects?: RecentProject[]
  language?: string
  pdfViewMode?: 'continuous' | 'single'
  showPdfToolbarControls?: boolean
  scrollSyncEnabled?: boolean
  bracketPairColorization?: boolean
  stickyScrollEnabled?: boolean
  smoothScrolling?: boolean
  fontLigatures?: boolean
  minimapEnabled?: boolean
  rendererSession?: RendererSessionSnapshot
}

export type AiAction = 'fix' | 'academic' | 'summarize' | 'longer' | 'shorter'

export interface AiLightContext {
  filePath: string
  sectionPath: string[]
  outline: string[]
  beforeSelection: string
  afterSelection: string
}

export interface AiContextEntry {
  filePath: string
  contentHash: string
  generatedAt: string
  summary: string
}

export interface AiProcessRequest {
  action: AiAction
  selectedText: string
  filePath: string
  lightContext: AiLightContext
  summaryContext: AiContextEntry | null
}

export interface AiCustomProcessRequest {
  command: string
  selectedText: string
  filePath: string
  lightContext: AiLightContext
  summaryContext: AiContextEntry | null
}

export type AiProvider = Exclude<UserSettings['aiProvider'], ''>

export interface ResearchChatExecution {
  provider: AiProvider
  model: string
}

export interface ResearchChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** Provider and model that produced this assistant response. */
  execution?: ResearchChatExecution
  /** Sources captured for this answer; ignored when the message is sent as provider history. */
  sources?: ResearchChatSessionContext[]
}

export type ResearchChatSessionContextKind =
  'paper' | 'document' | 'repository' | 'website' | 'author' | 'reference'

/** Metadata-only description of a selected Chat context. Context bodies are never persisted. */
export interface ResearchChatSessionContext {
  id: string
  kind: ResearchChatSessionContextKind
  label: string
  source?: string
  resourceId?: string
  citekey?: string
  referenceSource?: 'project' | 'zotero' | 'online'
  onlineReference?: OnlineReference
}

/** Per-project Research Chat state stored in .textex/research-chat.json. */
export interface ResearchChatSession {
  version: 1
  messages: ResearchChatMessage[]
  selectedContexts: ResearchChatSessionContext[]
  /** Conversation-local override. Omitted sessions inherit the global AI settings. */
  execution?: ResearchChatExecution
}

/** Opaque native activation and compare-and-swap token for one project Chat session. */
export interface ResearchChatSessionScope {
  projectRoot: string
  projectEpoch: string
  revision: string
}

export interface ResearchChatSessionSnapshot extends ResearchChatSessionScope {
  session: ResearchChatSession
}

interface ResearchChatContextBase {
  label: string
  source?: string
}

export type ResearchReferenceDescriptor =
  | { source: 'project' | 'zotero'; citekey: string; onlineReference?: never }
  | { source: 'online'; citekey?: string; onlineReference: OnlineReference }

export type ResearchChatContext =
  | (ResearchChatContextBase & {
      kind: 'repository' | 'website'
      /** Binds native Chat-access validation to the saved project profile. */
      resourceId: string
      content: string
    })
  | (ResearchChatContextBase & {
      kind: 'paper' | 'document' | 'author'
      resourceId?: never
      content: string
    })
  | (ResearchChatContextBase & {
      kind: 'reference'
      resourceId?: never
      content?: never
      reference: ResearchReferenceDescriptor
    })

export interface ResearchChatRequest {
  /** Renderer-generated identifier used only to cancel this in-flight request. */
  requestId?: string
  message: string
  history: ResearchChatMessage[]
  contexts: ResearchChatContext[]
  instructions: string[]
  /** Optional conversation-local provider/model override. */
  execution?: ResearchChatExecution
}

export interface ResearchChatResponse {
  content: string
  execution: ResearchChatExecution
}

export interface ZoteroPlanRequest {
  message: string
  history: ResearchChatMessage[]
}

export type ZoteroMutationOperation =
  | {
      kind: 'createCollection'
      key: string
      name: string
      path: string
      parentKey: string | null
      parentLabel: string
    }
  | {
      kind: 'moveCollection'
      key: string
      version: number
      name: string
      path: string
      parentKey: string | null
      parentLabel: string
    }
  | {
      kind: 'renameCollection'
      key: string
      version: number
      name: string
      path: string
      newName: string
    }
  | {
      kind: 'updateItem'
      key: string
      version: number
      title: string
      currentTags: string[]
      addTags: string[]
      removeTags: string[]
      currentCollections: string[]
      addCollections: ZoteroMutationCollectionRef[]
      removeCollections: ZoteroMutationCollectionRef[]
    }

export interface ZoteroMutationCollectionRef {
  key: string
  path: string
}

export interface ZoteroMutationPlan {
  summary: string
  serverId: string
  port: number
  projectRoot: string
  projectEpoch: string
  operations: ZoteroMutationOperation[]
}

export interface ZoteroMutationResult {
  summary: string
  applied: number
  collectionChanges: number
  itemChanges: number
}

export interface ClaudeTerminalRequest {
  workDir: string
  resume?: boolean
  /** Optional initial instruction passed as one literal CLI argument. */
  prompt?: string
}

export interface AiCliStatus {
  available: boolean
  version?: string
  error?: string
}

export interface ClaudeTerminalResult {
  success: boolean
  workDir: string
  command: string
}

export type CodexTerminalRequest = ClaudeTerminalRequest
export type CodexTerminalResult = ClaudeTerminalResult

export interface CitationGroup {
  id: string
  name: string
  citekeys: string[]
}

export interface ZoteroSearchResult {
  citekey: string
  title: string
  author: string
  year: string
  type: string
}

export interface ZoteroSyncResult {
  filePath: string
  bytesWritten: number
  entryCount: number
}

export interface ZoteroCollection {
  key: string
  name: string
  parentKey: string | null
  itemCount: number | null
}

export interface ZoteroLibrary {
  key: string
  name: string
  itemCount: number | null
  collections: ZoteroCollection[]
}

export interface ZoteroCollectionItem {
  itemKey: string
  citekey: string | null
  title: string
  author: string
  year: string
  type: string
  doi: string | null
  arxivId: string | null
}

export interface ZoteroCollectionItemsPage {
  items: ZoteroCollectionItem[]
  totalResults: number
  offset: number
  limit: number
}

export interface OnlineReference {
  source: 'crossref' | 'arxiv'
  id: string
  title: string
  authors: string[]
  year: string
  type: string
  doi?: string
  arxivId?: string
  url?: string
  abstract?: string
}

export interface ReferenceAddResult {
  filePath: string
  citekey: string
  inserted: boolean
  duplicate: boolean
}

export interface ZoteroSaveResult {
  itemKey: string
  citekey: string | null
  duplicate: boolean
}

export interface ResearchConfig {
  version: 1
  referencesFile: string
  zoteroFile: string
  zoteroCollection: string | null
  syncOnOpen: boolean
  /**
   * Mirrors the configured collection into the managed file whenever the
   * Zotero panel observes the collection change while a project is open.
   */
  autoSync: boolean
}

/** A person associated with the paper-level research profile. */
export interface ResearchPerson {
  id: string
  name: string
  role?: string
  email?: string
  homepage?: string
  github?: string
  orcid?: string
}

export interface ResearchPaperMetadata {
  title: string
  abstract?: string
  doi?: string
  arxiv?: string
  venue?: string
  website?: string
  authors: ResearchPerson[]
}

export type ResearchResourceKind = 'git' | 'website' | 'dataset' | 'documentation'
export type ResearchChatAccess = 'none' | 'metadata' | 'indexed-read' | 'snapshot'

/** A non-secret external or local resource attached to a research project. */
export interface ResearchResource {
  id: string
  kind: ResearchResourceKind
  label: string
  url?: string
  sshUrl?: string
  localPath?: string
  branch?: string
  chatAccess: ResearchChatAccess
}

/** Per-project research metadata stored in .textex/research-profile.json. */
export interface ResearchProfile {
  version: 1
  paper: ResearchPaperMetadata
  resources: ResearchResource[]
  instructions: string[]
}

export interface ResearchSourceFile {
  path: string
  bytes: number
  language: string
}

export interface ResearchSourceIndex {
  resourceId: string
  rootPath: string
  branch: string | null
  indexedAt: number
  files: ResearchSourceFile[]
  fileCount: number
  totalBytes: number
  truncated: boolean
}

export interface ResearchSourceSearchResult {
  resourceId: string
  path: string
  line: number
  startLine: number
  snippet: string
  score: number
}

export interface ResearchSourceGitResult {
  success: boolean
  resourceId: string
  localPath: string
  action: 'cloned' | 'fetched'
  output: string
}

export interface ResearchResourceSnapshot {
  resourceId: string
  url: string
  fetchedAt: number
  content: string
  truncated: boolean
}

export interface HistoryItem {
  timestamp: number
  size: number
  path: string
}

export type RecoveryDiskState = 'modified' | 'missing' | 'unavailable' | 'unchanged'

export interface RecoveryItem {
  id: string
  filePath: string
  capturedAtEpochMs: number
  size: number
  diskState: RecoveryDiskState
}

export interface RecoverySnapshot {
  item: RecoveryItem
  content: string
  diskContent: string | null
}

export type TectonicCacheIntegrity = 'missing' | 'empty' | 'verified' | 'unverified' | 'corrupt'

export interface TectonicSeedStatus {
  path: string
  fileCount: number
  totalBytes: number
  ready: boolean
  integrity: TectonicCacheIntegrity
  seedVersion: string | null
  detail: string
}

export interface TectonicActiveCacheStatus {
  path: string
  fileCount: number
  totalBytes: number
  ready: boolean
  integrity: TectonicCacheIntegrity
  installedSeedVersion: string | null
  detail: string
}

export interface TectonicCacheStatus {
  seed: TectonicSeedStatus
  cache: TectonicActiveCacheStatus
  cacheUsable: boolean
  networkFallback: boolean
}

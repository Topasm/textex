export type DiagnosticSeverity = 'error' | 'warning' | 'info'

export interface Diagnostic {
  file: string
  line: number
  column?: number
  severity: DiagnosticSeverity
  message: string
}

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

export interface DirectoryEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: DirectoryEntry[]
}

export interface BibEntry {
  key: string
  type: string
  title: string
  author: string
  year: string
  journal?: string
  file?: string
  line?: number
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

export interface SectionNode {
  title: string
  level: SectionLevel
  starred: boolean
  file: string
  startLine: number
  endLine: number
  children: SectionNode[]
}

export interface DocumentSymbolNode {
  name: string
  detail: string
  kind: number // LSP SymbolKind
  range: { startLine: number; startColumn: number; endLine: number; endColumn: number }
  selectionRange: { startLine: number; startColumn: number; endLine: number; endColumn: number }
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

export interface UserSettings {
  theme: 'system' | 'dark' | 'light' | 'high-contrast' | 'glass'
  fontSize: number
  autoCompile: boolean
  spellCheckEnabled: boolean
  spellCheckLanguage: string
  gitEnabled: boolean
  autoUpdateEnabled: boolean
  lspEnabled: boolean
  zoteroEnabled: boolean
  zoteroPort: number
  aiEnabled?: boolean
  aiProvider: 'openai' | 'anthropic' | 'gemini' | ''
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
  name?: string
  email?: string
  affiliation?: string
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
  minimap?: boolean
  tabSize?: number
  recentProjects?: RecentProject[]
  language?: string
  pdfViewMode?: 'continuous' | 'single'
  showPdfToolbarControls?: boolean
}

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

export interface HistoryItem {
  timestamp: number
  size: number
  path: string
}

// ---- .textex/ Project Data ----

/** Per-project metadata stored in .textex/project.json */
export interface ProjectDatabase {
  version: number
  name: string
  mainFile: string
  created: string
  lastOpened: string
  documentClass: string
  description: string
  tags: string[]
  authors: string[]
}

/** Per-file compile record */
export interface CompileRecord {
  filePath: string
  lastCompiled: string
  duration: number
  exitCode: number
  pdfPath: string
  errorCount: number
  warningCount: number
  hash: string
}

/** Per-project compile state stored in .textex/compile.json */
export interface CompileDatabase {
  version: number
  totalCompiles: number
  lastCompiled: string | null
  records: Record<string, CompileRecord>
}

/** Project-specific snippet stored in .textex/snippets.json */
export interface ProjectSnippet {
  id: string
  prefix: string
  label: string
  body: string
  description: string
}

/** Editor bookmark stored in .textex/bookmarks.json */
export interface ProjectBookmark {
  id: string
  file: string
  line: number
  column: number
  label: string
  created: string
}

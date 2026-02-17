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
  theme: 'dark' | 'light' | 'high-contrast'
  fontSize: number
  autoCompile: boolean
  spellCheckEnabled: boolean
  spellCheckLanguage: string
  gitEnabled: boolean
  autoUpdateEnabled: boolean
  lspEnabled: boolean
  zoteroEnabled: boolean
  zoteroPort: number
  aiProvider: 'openai' | 'anthropic' | ''
  aiApiKey?: string
  aiModel: string
  pdfInvertMode?: boolean
  autoHideSidebar?: boolean
  wordWrap?: boolean
  formatOnSave?: boolean
  showStatusBar?: boolean
  recentProjects?: RecentProject[]
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

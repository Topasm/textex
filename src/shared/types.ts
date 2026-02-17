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

export interface UserSettings {
  theme: 'dark' | 'light' | 'high-contrast'
  fontSize: number
  autoCompile: boolean
  spellCheckEnabled: boolean
  spellCheckLanguage: string
  gitEnabled: boolean
  autoUpdateEnabled: boolean
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

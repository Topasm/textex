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

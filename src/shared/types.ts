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

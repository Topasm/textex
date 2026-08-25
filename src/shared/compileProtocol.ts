import type { Diagnostic } from './types'

export type CompilePriority = 'high' | 'normal' | 'background'

export interface CompileIdentity {
  /** Monotonic renderer request id used for latest-wins ordering. */
  requestId: number
  documentId: string
  documentRevision: number
}

export interface CompileRequest extends CompileIdentity {
  filePath: string
  priority: CompilePriority
}

export interface CompileResponse extends CompileIdentity {
  pdfPath: string
  /** Actual root file after resolving `%! TeX root`. */
  compiledFilePath: string
  /** Bounded UTF-8 citation metadata read from the engine-specific build cache. */
  auxContent?: string
}

export interface CompileLogEvent extends CompileIdentity {
  text: string
}

export interface CompileDiagnosticsEvent extends CompileIdentity {
  diagnostics: Diagnostic[]
}

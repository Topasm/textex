/**
 * Runtime-neutral editor primitives.
 *
 * These types deliberately use one-based line and column numbers, matching the
 * public coordinates already used by TextEx, while avoiding Monaco types in UI
 * state and editor-independent features.
 */
export interface EditorPosition {
  line: number
  column: number
}

export interface EditorRange {
  start: EditorPosition
  end: EditorPosition
}

export interface EditorSelection extends EditorRange {
  anchor: EditorPosition
  active: EditorPosition
  isEmpty: boolean
}

export interface EditorTextEdit {
  range: EditorRange
  text: string
  forceMoveMarkers?: boolean
}

export interface EditorTextChange extends EditorTextEdit {
  rangeOffset: number
  rangeLength: number
}

export type EditorDiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint'

export interface EditorDiagnostic {
  range: EditorRange
  severity: EditorDiagnosticSeverity
  message: string
  source?: string
  code?: string
}

export interface EditorDecoration {
  range: EditorRange
  isWholeLine?: boolean
  className?: string
  inlineClassName?: string
  marginClassName?: string
  hoverMessage?: string
}

export interface EditorSnapshot {
  documentId: string | null
  /**
   * Monotonic only for the lifetime of this mounted adapter. Long-running work
   * must use the canonical DocumentModel snapshot revision instead.
   */
  engineRevision: number
  text: string
}

export interface EditorDocumentChange {
  snapshot: EditorSnapshot
  changes: readonly EditorTextChange[]
  isFlush: boolean
}

export interface EditorDisposable {
  dispose(): void
}

export interface EditorRevealOptions {
  center?: boolean
  focus?: boolean
}

export interface EditorVisibleLineRange {
  startLine: number
  endLine: number
}

/**
 * The editor-engine boundary consumed by renderer features.
 *
 * Monaco-only integration such as language providers and native actions stays
 * in the Monaco layer. Document operations should use this contract so a
 * future editor engine can be benchmarked without rewriting feature logic.
 */
export interface EditorAdapter {
  setDocumentId(documentId: string | null): void
  getDocumentId(): string | null

  getText(range?: EditorRange): string
  getEngineRevision(): number
  getSnapshot(): EditorSnapshot
  getLineCount(): number
  getLineMaxColumn(line: number): number

  getPosition(): EditorPosition | null
  getSelection(): EditorSelection | null
  getPositionAtClientPoint(clientX: number, clientY: number): EditorPosition | null
  setPosition(position: EditorPosition): void
  revealPosition(position: EditorPosition, options?: EditorRevealOptions): void

  applyEdits(source: string, edits: readonly EditorTextEdit[]): boolean
  setDiagnostics(owner: string, diagnostics: readonly EditorDiagnostic[]): void
  setDecorations(owner: string, decorations: readonly EditorDecoration[]): EditorDisposable
  clearDecorations(owner: string): void

  onDidChangeDocument(listener: (event: EditorDocumentChange) => void): EditorDisposable
  onDidScroll(listener: () => void): EditorDisposable
  getVisibleLineRange(): EditorVisibleLineRange | null
  scrollToLine(line: number): void

  focus(): void
  dispose(): void
}

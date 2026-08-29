import {
  DocumentModel,
  type DocumentChangeSource,
  type DocumentRevisionSnapshot,
  type DocumentSnapshot
} from './documentModel'
import type { EditorTextEdit } from '../editor/EditorAdapter'

export interface DocumentTextBuffer {
  readonly documentId: string
  getText(): string
  replaceText(text: string): void
  applyEdits(source: string, edits: readonly EditorTextEdit[]): boolean
}

export type DiskReloadResult =
  | { readonly status: 'applied'; readonly snapshot: DocumentSnapshot }
  | { readonly status: 'unchanged'; readonly snapshot: DocumentSnapshot }
  | { readonly status: 'dirty'; readonly snapshot: DocumentSnapshot }
  | { readonly status: 'stale'; readonly snapshot: DocumentSnapshot }

interface DocumentEntry {
  filePath: string
  model: DocumentModel
  buffer: DocumentTextBuffer
  replacingBuffer: boolean
}

function isWindowsPath(filePath: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(filePath) || filePath.startsWith('\\\\')
}

export function normalizeDocumentId(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  return isWindowsPath(filePath) ? normalized.toLocaleLowerCase('en-US') : normalized
}

function createBootstrapBuffer(documentId: string, initialText: string): DocumentTextBuffer {
  let text = initialText
  return {
    documentId,
    getText: () => text,
    replaceText: (nextText) => {
      text = nextText
    },
    applyEdits: (_source, edits) => {
      const nextText = applyTextEdits(text, edits)
      if (nextText === null) return false
      text = nextText
      return true
    }
  }
}

function offsetAt(text: string, line: number, column: number): number | null {
  if (!Number.isSafeInteger(line) || line < 1 || !Number.isSafeInteger(column) || column < 1) {
    return null
  }
  const lines = text.split('\n')
  if (line > lines.length || column > lines[line - 1].length + 1) return null
  let offset = column - 1
  for (let index = 0; index < line - 1; index += 1) offset += lines[index].length + 1
  return offset
}

/** Applies editor-style ranges without requiring an active editor engine. */
function applyTextEdits(text: string, edits: readonly EditorTextEdit[]): string | null {
  const resolved = edits.map((edit) => {
    const start = offsetAt(text, edit.range.start.line, edit.range.start.column)
    const end = offsetAt(text, edit.range.end.line, edit.range.end.column)
    return start === null || end === null || end < start ? null : { start, end, text: edit.text }
  })
  if (resolved.some((edit) => edit === null)) return null

  const descending = resolved
    .filter((edit): edit is NonNullable<typeof edit> => edit !== null)
    .sort((left, right) => right.start - left.start)
  for (let index = 1; index < descending.length; index += 1) {
    if (descending[index - 1].start < descending[index].end) return null
  }

  let result = text
  for (const edit of descending) {
    result = `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`
  }
  return result
}

export class DocumentRegistry {
  readonly #documents = new Map<string, DocumentEntry>()

  open(filePath: string, text: string): DocumentSnapshot {
    const id = normalizeDocumentId(filePath)
    const existing = this.#documents.get(id)
    if (existing) return existing.model.snapshot()

    const buffer = createBootstrapBuffer(id, text)
    const model = new DocumentModel(id, () => buffer.getText())
    this.#documents.set(id, { filePath, model, buffer, replacingBuffer: false })
    return model.snapshot()
  }

  /** Moves canonical text ownership from the bootstrap buffer to an editor model. */
  bindBuffer(filePath: string, buffer: DocumentTextBuffer): boolean {
    const entry = this.#documents.get(normalizeDocumentId(filePath))
    if (!entry || normalizeDocumentId(buffer.documentId) !== entry.model.documentId) return false

    const currentText = entry.buffer.getText()
    if (buffer.getText() !== currentText) {
      entry.replacingBuffer = true
      try {
        buffer.replaceText(currentText)
      } finally {
        entry.replacingBuffer = false
      }
    }
    entry.buffer = buffer
    entry.model.bindMaterializer(() => buffer.getText())
    return true
  }

  has(filePath: string): boolean {
    return this.#documents.has(normalizeDocumentId(filePath))
  }

  getModel(filePath: string): DocumentModel | null {
    return this.#documents.get(normalizeDocumentId(filePath))?.model ?? null
  }

  getFilePath(filePath: string): string | null {
    return this.#documents.get(normalizeDocumentId(filePath))?.filePath ?? null
  }

  revisionSnapshot(filePath: string): DocumentRevisionSnapshot | null {
    return this.getModel(filePath)?.revisionSnapshot() ?? null
  }

  /** Explicitly materializes a stable full-text snapshot. */
  snapshot(filePath: string): DocumentSnapshot | null {
    return this.getModel(filePath)?.snapshot() ?? null
  }

  /** Records a Monaco delta without reading the full document string. */
  recordEditorChange(filePath: string): DocumentRevisionSnapshot | null {
    const entry = this.#documents.get(normalizeDocumentId(filePath))
    if (!entry) return null
    if (entry.replacingBuffer) return entry.model.revisionSnapshot()
    return entry.model.recordChange('editor')
  }

  update(
    filePath: string,
    text: string,
    source: DocumentChangeSource = 'programmatic'
  ): DocumentSnapshot | null {
    const entry = this.#documents.get(normalizeDocumentId(filePath))
    if (!entry) return null
    if (entry.buffer.getText() === text) return entry.model.snapshot()

    this.#replaceBuffer(entry, text)
    entry.model.recordChange(source)
    return entry.model.snapshot()
  }

  applyEdits(
    filePath: string,
    source: DocumentChangeSource,
    edits: readonly EditorTextEdit[]
  ): DocumentSnapshot | null {
    const entry = this.#documents.get(normalizeDocumentId(filePath))
    if (!entry) return null
    if (edits.length === 0) return entry.model.snapshot()

    let applied = false
    entry.replacingBuffer = true
    try {
      applied = entry.buffer.applyEdits(source, edits)
    } finally {
      entry.replacingBuffer = false
    }
    if (!applied) return null
    entry.model.recordChange(source)
    return entry.model.snapshot()
  }

  markSaved(filePath: string, revision?: number): boolean {
    return this.getModel(filePath)?.markSaved(revision) ?? false
  }

  reloadIfCurrent(
    filePath: string,
    text: string,
    observedSnapshot: DocumentRevisionSnapshot
  ): DiskReloadResult | null {
    const entry = this.#documents.get(normalizeDocumentId(filePath))
    if (!entry) return null
    const current = entry.model.snapshot()
    if (!entry.model.isCurrent(observedSnapshot)) return { status: 'stale', snapshot: current }
    if (entry.model.isDirty) return { status: 'dirty', snapshot: current }

    if (entry.buffer.getText() === text) {
      entry.model.markSaved(current.revision)
      return { status: 'unchanged', snapshot: entry.model.snapshot() }
    }

    this.#replaceBuffer(entry, text)
    entry.model.recordReload()
    return { status: 'applied', snapshot: entry.model.snapshot() }
  }

  replaceFromDisk(filePath: string, text: string): DocumentSnapshot | null {
    const entry = this.#documents.get(normalizeDocumentId(filePath))
    if (!entry) return null
    if (entry.buffer.getText() === text) {
      entry.model.markSaved()
      return entry.model.snapshot()
    }

    this.#replaceBuffer(entry, text)
    entry.model.recordReload()
    return entry.model.snapshot()
  }

  dirtySnapshots(): Array<{ filePath: string; snapshot: DocumentSnapshot }> {
    const dirty: Array<{ filePath: string; snapshot: DocumentSnapshot }> = []
    for (const entry of this.#documents.values()) {
      if (entry.model.isDirty) {
        dirty.push({ filePath: entry.filePath, snapshot: entry.model.snapshot() })
      }
    }
    return dirty
  }

  close(filePath: string): boolean {
    return this.#documents.delete(normalizeDocumentId(filePath))
  }

  clear(): void {
    this.#documents.clear()
  }

  #replaceBuffer(entry: DocumentEntry, text: string): void {
    entry.replacingBuffer = true
    try {
      entry.buffer.replaceText(text)
    } finally {
      entry.replacingBuffer = false
    }
  }
}

export const documentRegistry = new DocumentRegistry()

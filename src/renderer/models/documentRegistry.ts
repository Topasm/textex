import {
  DocumentModel,
  type DocumentChangeSource,
  type DocumentRevisionSnapshot,
  type DocumentSnapshot
} from './documentModel'

export interface DocumentTextBuffer {
  readonly documentId: string
  getText(): string
  replaceText(text: string): void
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
    }
  }
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

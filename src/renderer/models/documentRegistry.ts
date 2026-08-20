import {
  DocumentModel,
  type DiskReloadResult,
  type DocumentChangeSource,
  type DocumentSnapshot
} from './documentModel'

interface DocumentEntry {
  filePath: string
  model: DocumentModel
}

function isWindowsPath(filePath: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(filePath) || filePath.startsWith('\\\\')
}

export function normalizeDocumentId(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  return isWindowsPath(filePath) ? normalized.toLocaleLowerCase('en-US') : normalized
}

export class DocumentRegistry {
  readonly #documents = new Map<string, DocumentEntry>()

  open(filePath: string, text: string): DocumentSnapshot {
    const id = normalizeDocumentId(filePath)
    const existing = this.#documents.get(id)
    if (existing) return existing.model.snapshot()

    const model = new DocumentModel(id, text)
    this.#documents.set(id, { filePath, model })
    return model.snapshot()
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

  snapshot(filePath: string): DocumentSnapshot | null {
    return this.getModel(filePath)?.snapshot() ?? null
  }

  update(
    filePath: string,
    text: string,
    source: DocumentChangeSource = 'editor'
  ): DocumentSnapshot | null {
    return this.getModel(filePath)?.updateText(text, source) ?? null
  }

  markSaved(filePath: string, revision?: number): boolean {
    return this.getModel(filePath)?.markSaved(revision) ?? false
  }

  reloadIfCurrent(
    filePath: string,
    text: string,
    observedSnapshot: DocumentSnapshot
  ): DiskReloadResult | null {
    return this.getModel(filePath)?.reloadFromDisk(text, observedSnapshot) ?? null
  }

  replaceFromDisk(filePath: string, text: string): DocumentSnapshot | null {
    return this.getModel(filePath)?.replaceFromDisk(text) ?? null
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
}

export const documentRegistry = new DocumentRegistry()

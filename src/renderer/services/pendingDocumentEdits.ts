import { normalizeDocumentId } from '../models/documentRegistry'

type PendingDocumentEditFlusher = () => void

const flushers = new Map<string, Set<PendingDocumentEditFlusher>>()

/** Registers an alternate document surface whose buffered edits must cross lifecycle boundaries. */
export function registerPendingDocumentEditFlusher(
  filePath: string,
  flush: PendingDocumentEditFlusher
): () => void {
  const documentId = normalizeDocumentId(filePath)
  const documentFlushers = flushers.get(documentId) ?? new Set<PendingDocumentEditFlusher>()
  documentFlushers.add(flush)
  flushers.set(documentId, documentFlushers)

  return () => {
    const current = flushers.get(documentId)
    current?.delete(flush)
    if (current?.size === 0) flushers.delete(documentId)
  }
}

/** Makes a document's buffered projections current before save, compile, switch, or close. */
export function flushPendingDocumentEdits(filePath: string): void {
  const documentFlushers = flushers.get(normalizeDocumentId(filePath))
  if (!documentFlushers) return
  for (const flush of [...documentFlushers]) flush()
}

/** Makes every open document current before a project or application transition. */
export function flushAllPendingDocumentEdits(): void {
  for (const documentFlushers of [...flushers.values()]) {
    for (const flush of [...documentFlushers]) flush()
  }
}

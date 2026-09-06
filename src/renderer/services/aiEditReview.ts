import type { DocumentRevisionSnapshot } from '../models/documentModel'
import { documentRegistry, normalizeDocumentId } from '../models/documentRegistry'

export interface AiEditReviewData {
  filePath: string
  projectRoot: string | null
  appliedSnapshot: DocumentRevisionSnapshot
  before: string
  after: string
  isCurrent: () => boolean
}

export function currentAiEdit(filePath: string, snapshot: DocumentRevisionSnapshot): () => boolean {
  const model = documentRegistry.getModel(filePath)
  return () => documentRegistry.getModel(filePath) === model && Boolean(model?.isCurrent(snapshot))
}

export function isAiEditCompiled(
  snapshot: DocumentRevisionSnapshot,
  compile: {
    compileStatus: string
    pdfDocumentId: string | null
    pdfDocumentRevision: number | null
  }
): boolean {
  return (
    compile.compileStatus === 'success' &&
    compile.pdfDocumentId !== null &&
    normalizeDocumentId(compile.pdfDocumentId) === normalizeDocumentId(snapshot.documentId) &&
    compile.pdfDocumentRevision === snapshot.revision
  )
}

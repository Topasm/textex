import { documentRegistry, normalizeDocumentId } from '../models/documentRegistry'
import type { DocumentSnapshot } from '../models/documentModel'
import { useCompileStore } from '../store/useCompileStore'
import { useEditorStore } from '../store/useEditorStore'
import { flushAllPendingDocumentEdits } from './pendingDocumentEdits'
import { useProjectStore } from '../store/useProjectStore'

let interactionEpoch = 0

/** Shared authority for selection, Ctrl+click, and toolbar inverse SyncTeX. */
export function capturePdfSourceContext(displayedRevision: number) {
  const compiled = useCompileStore.getState()
  const sourcePath = compiled.pdfDocumentId
  if (
    !sourcePath ||
    compiled.pdfRevision !== displayedRevision ||
    compiled.compileStatus === 'compiling'
  )
    return null
  const source = documentRegistry.getModel(sourcePath)
  if (!source || source.revision !== compiled.pdfDocumentRevision) return null
  const epoch = ++interactionEpoch
  const projectRoot = useProjectStore.getState().projectRoot
  const editor = useEditorStore.getState()
  const models = Object.keys(editor.openFiles).map((path) => {
    const model = documentRegistry.getModel(path)
    return { path, model, revision: model?.revision }
  })
  return {
    sourcePath,
    pdfRevision: compiled.pdfRevision,
    isCurrent: () => {
      const next = useCompileStore.getState()
      return (
        epoch === interactionEpoch &&
        next.compileStatus !== 'compiling' &&
        next.pdfRevision === compiled.pdfRevision &&
        next.pdfDocumentId === sourcePath &&
        next.pdfDocumentRevision === compiled.pdfDocumentRevision &&
        useProjectStore.getState().projectRoot === projectRoot &&
        useEditorStore.getState().tabMutationEpoch === editor.tabMutationEpoch &&
        documentRegistry.getModel(sourcePath) === source &&
        source.revision === compiled.pdfDocumentRevision &&
        models.every(
          ({ path, model, revision }) =>
            documentRegistry.getModel(path) === model && model?.revision === revision
        )
      )
    }
  }
}

export interface PreparedPdfSource {
  filePath: string
  text: string
  /** Activate only after the caller has validated its source line/range. */
  activate: () => DocumentSnapshot | null
}

/** The native inverse lookup and read enforce project/symlink containment. */
export async function preparePdfSource(
  requestedPath: string,
  isCurrent: () => boolean
): Promise<PreparedPdfSource | null> {
  if (!isCurrent()) return null
  const openPath = documentRegistry.getFilePath(requestedPath)
  if (openPath) {
    const model = documentRegistry.getModel(openPath)!
    if (model.isDirty) return null
    const snapshot = model.snapshot()
    return {
      filePath: openPath,
      text: snapshot.text,
      activate: () => {
        flushAllPendingDocumentEdits()
        if (
          !isCurrent() ||
          documentRegistry.getModel(openPath) !== model ||
          model.revision !== snapshot.revision ||
          model.isDirty
        )
          return null
        if (useEditorStore.getState().filePath !== openPath)
          useEditorStore.getState().setActiveTab(openPath)
        return documentRegistry.snapshot(openPath)
      }
    }
  }
  const loaded = await window.api.readFile(requestedPath)
  if (
    !isCurrent() ||
    normalizeDocumentId(loaded.filePath) !== normalizeDocumentId(requestedPath) ||
    documentRegistry.has(loaded.filePath)
  )
    return null
  return {
    filePath: loaded.filePath,
    text: loaded.content,
    activate: () => {
      flushAllPendingDocumentEdits()
      if (!isCurrent() || documentRegistry.has(loaded.filePath)) return null
      useEditorStore.getState().openFileInTab(loaded.filePath, loaded.content)
      return documentRegistry.snapshot(loaded.filePath)
    }
  }
}

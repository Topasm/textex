import type { DocumentSnapshot } from '../models/documentModel'
import { documentRegistry, normalizeDocumentId } from '../models/documentRegistry'
import { useEditorStore } from '../store/useEditorStore'
import { syncRecoveryForFiles } from './crashRecovery'

/**
 * Persists one coherent set of dirty editor buffers before an explicit compile.
 * History-restored inactive documents remain protected until the user saves them.
 */
export async function prepareDocumentsForManualCompile(
  activeFilePath: string,
  activeSnapshot: DocumentSnapshot
): Promise<void> {
  const activeId = normalizeDocumentId(activeFilePath)
  const dirtyDocuments = documentRegistry.dirtySnapshots()
  const blocked = dirtyDocuments.filter(
    ({ filePath }) =>
      normalizeDocumentId(filePath) !== activeId &&
      documentRegistry.getModel(filePath)?.requiresExplicitSave
  )
  if (blocked.length > 0) {
    const names = blocked
      .map(({ filePath }) => filePath.split(/[\\/]/u).at(-1) || filePath)
      .join(', ')
    throw new Error(`Save restored history documents before compiling: ${names}`)
  }

  if (dirtyDocuments.length > 0) {
    await window.api.saveFileBatch(
      dirtyDocuments.map(({ filePath, snapshot }) => ({
        filePath,
        content: snapshot.text
      }))
    )
    for (const { filePath, snapshot } of dirtyDocuments) {
      useEditorStore.getState().markDocumentSaved(filePath, snapshot.revision)
    }
    await syncRecoveryForFiles(dirtyDocuments.map(({ filePath }) => filePath))
  }

  const changedDuringSave = dirtyDocuments.some(
    ({ filePath, snapshot }) => !documentRegistry.getModel(filePath)?.isCurrent(snapshot)
  )
  if (changedDuringSave || !documentRegistry.getModel(activeFilePath)?.isCurrent(activeSnapshot)) {
    throw new Error('A document changed while files were being saved. Compile again.')
  }
}

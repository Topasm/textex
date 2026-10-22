import type { DocumentSnapshot } from '../models/documentModel'
import { documentRegistry, normalizeDocumentId } from '../models/documentRegistry'
import { useEditorStore } from '../store/useEditorStore'
import { syncRecoveryForFiles } from './crashRecovery'
import { documentDiskWrite } from './documentDiskWrite'
import { pendingDiskReload } from './pendingDiskReloads'

export type CompilePersistenceMode = 'manual' | 'automatic'

export type CompilePreparationResult =
  | { status: 'ready'; savedFilePaths: string[] }
  | { status: 'protected'; filePaths: string[] }
  | { status: 'stale'; savedFilePaths: string[] }

interface CompilePreparationOptions {
  activeFilePath: string
  activeSnapshot: DocumentSnapshot
  mode: CompilePersistenceMode
  /** The document open in the editor when the compiled root is a different file. */
  editedFilePath?: string | null
}

/**
 * Persists one coherent set of editor buffers before compilation.
 *
 * Manual compiles may save the active history-restored document, but protect
 * inactive restores. Automatic compiles never save a history restore and are
 * blocked when the active document itself requires an explicit save.
 */
export async function prepareDocumentsForCompile({
  activeFilePath,
  activeSnapshot,
  mode,
  editedFilePath
}: CompilePreparationOptions): Promise<CompilePreparationResult> {
  const pending = Object.keys(useEditorStore.getState().openFiles)
    .map(pendingDiskReload)
    .filter((reload): reload is Promise<void> => reload !== null)
  if (pending.length > 0) await Promise.all(pending)
  if (!documentRegistry.getModel(activeFilePath)?.isCurrent(activeSnapshot)) {
    return { status: 'stale', savedFilePaths: [] }
  }
  // Both the compiled root and the file being edited count as the author's own documents.
  const activeIds = new Set(
    [activeFilePath, editedFilePath].flatMap((path) => (path ? [normalizeDocumentId(path)] : []))
  )
  const dirtyDocuments = documentRegistry.dirtySnapshots()
  const protectedDocuments = dirtyDocuments.filter(({ filePath }) => {
    if (!documentRegistry.getModel(filePath)?.requiresExplicitSave) return false
    return mode === 'automatic' || !activeIds.has(normalizeDocumentId(filePath))
  })

  if (
    mode === 'manual'
      ? protectedDocuments.length > 0
      : protectedDocuments.some(({ filePath }) => activeIds.has(normalizeDocumentId(filePath)))
  ) {
    return {
      status: 'protected',
      filePaths: protectedDocuments.map(({ filePath }) => filePath)
    }
  }

  const documentsToSave =
    mode === 'automatic'
      ? dirtyDocuments.filter(
          ({ filePath }) => !documentRegistry.getModel(filePath)?.requiresExplicitSave
        )
      : dirtyDocuments
  const savedFilePaths = documentsToSave.map(({ filePath }) => filePath)

  if (documentsToSave.length > 0) {
    const result = await documentDiskWrite(documentsToSave, () =>
      window.api.saveFileBatch(
        documentsToSave.map(({ filePath, snapshot }) => ({
          filePath,
          content: snapshot.text
        }))
      )
    )
    if (!result.success) throw new Error('Could not save documents before compiling.')
    for (const { filePath, snapshot } of documentsToSave) {
      if (documentRegistry.getModel(filePath)?.isCurrent(snapshot)) {
        useEditorStore.getState().markDocumentSaved(filePath, snapshot.revision)
      }
    }
    await syncRecoveryForFiles(savedFilePaths)
  }

  const changedDuringSave = documentsToSave.some(
    ({ filePath, snapshot }) => !documentRegistry.getModel(filePath)?.isCurrent(snapshot)
  )
  const activeDocumentChanged = !documentRegistry
    .getModel(activeFilePath)
    ?.isCurrent(activeSnapshot)

  return changedDuringSave || activeDocumentChanged
    ? { status: 'stale', savedFilePaths }
    : { status: 'ready', savedFilePaths }
}

export async function prepareDocumentsForManualCompile(
  activeFilePath: string,
  activeSnapshot: DocumentSnapshot,
  editedFilePath?: string | null
): Promise<void> {
  const result = await prepareDocumentsForCompile({
    activeFilePath,
    activeSnapshot,
    mode: 'manual',
    editedFilePath
  })
  if (result.status === 'ready') return

  if (result.status === 'protected') {
    const names = result.filePaths
      .map((filePath) => filePath.split(/[\\/]/u).at(-1) || filePath)
      .join(', ')
    throw new Error(`Save restored history documents before compiling: ${names}`)
  }

  throw new Error('A document changed while files were being saved. Compile again.')
}

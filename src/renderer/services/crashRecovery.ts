import type { RecoverySnapshot } from '../../shared/types'
import { documentRegistry, normalizeDocumentId } from '../models/documentRegistry'
import { useEditorStore } from '../store/useEditorStore'

export const RECOVERY_AUTOSNAPSHOT_DELAY_MS = 2000

const operationQueues = new Map<string, Promise<void>>()
const intentionallyDiscardedDocuments = new Set<string>()

function enqueueFileOperation(filePath: string, operation: () => Promise<void>): Promise<void> {
  const id = normalizeDocumentId(filePath)
  const previous = operationQueues.get(id) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(operation)
  operationQueues.set(id, next)
  const cleanup = (): void => {
    if (operationQueues.get(id) === next) operationQueues.delete(id)
  }
  void next.then(cleanup, cleanup)
  return next
}

export function clearRecoveryForFile(filePath: string): Promise<void> {
  return enqueueFileOperation(filePath, () => window.api.clearRecoverySnapshot(filePath))
}

export async function clearRecoveryForFiles(filePaths: readonly string[]): Promise<void> {
  await Promise.allSettled(filePaths.map((filePath) => clearRecoveryForFile(filePath)))
}

/** Prevents a pending debounce from recreating copies the user chose to discard. */
export async function discardRecoveryForFiles(filePaths: readonly string[]): Promise<void> {
  for (const filePath of filePaths) {
    intentionallyDiscardedDocuments.add(normalizeDocumentId(filePath))
  }
  await clearRecoveryForFiles(filePaths)
}

/** Reconciles the native record with the latest registry state at queue time. */
export function syncRecoveryForFile(filePath: string): Promise<void> {
  return enqueueFileOperation(filePath, async () => {
    if (intentionallyDiscardedDocuments.has(normalizeDocumentId(filePath))) {
      await window.api.clearRecoverySnapshot(filePath)
      return
    }
    const model = documentRegistry.getModel(filePath)
    if (!model?.isDirty) {
      await window.api.clearRecoverySnapshot(filePath)
      return
    }
    await window.api.saveRecoverySnapshot(filePath, model.snapshot().text)
  })
}

export async function syncRecoveryForFiles(filePaths: readonly string[]): Promise<void> {
  await Promise.allSettled(filePaths.map((filePath) => syncRecoveryForFile(filePath)))
}

export async function snapshotDirtyDocuments(): Promise<void> {
  await syncRecoveryForFiles(documentRegistry.dirtySnapshots().map(({ filePath }) => filePath))
}

/**
 * Installs one bounded, debounced bridge from document revisions to native
 * app-local recovery storage. The registry remains the text authority.
 */
export function installCrashRecoveryAutosnapshot(): () => void {
  let timer: number | null = null
  let disposed = false
  let knownOpenPaths = new Set(Object.keys(useEditorStore.getState().openFiles))

  const flush = (): void => {
    if (disposed) return
    timer = null
    void snapshotDirtyDocuments()
  }
  const schedule = (): void => {
    if (timer !== null) window.clearTimeout(timer)
    timer = window.setTimeout(flush, RECOVERY_AUTOSNAPSHOT_DELAY_MS)
  }

  const unsubscribe = useEditorStore.subscribe((state, previous) => {
    const openPaths = new Set(Object.keys(state.openFiles))
    for (const filePath of openPaths) {
      if (!knownOpenPaths.has(filePath)) {
        intentionallyDiscardedDocuments.delete(normalizeDocumentId(filePath))
      }
    }
    for (const filePath of knownOpenPaths) {
      if (!openPaths.has(filePath)) void clearRecoveryForFile(filePath).catch(() => undefined)
    }
    knownOpenPaths = openPaths

    if (state.revision !== previous.revision) {
      if (state.activeFilePath) {
        intentionallyDiscardedDocuments.delete(normalizeDocumentId(state.activeFilePath))
      }
      schedule()
    } else if (state.openFiles !== previous.openFiles) {
      schedule()
    }
  })

  const handleVisibilityChange = (): void => {
    if (document.visibilityState !== 'hidden') return
    if (timer !== null) window.clearTimeout(timer)
    flush()
  }
  document.addEventListener('visibilitychange', handleVisibilityChange)

  return () => {
    disposed = true
    unsubscribe()
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    if (timer !== null) window.clearTimeout(timer)
  }
}

/** Applies recovered text to the editor only; it never writes the source file. */
export function applyRecoveryToEditor(snapshot: RecoverySnapshot): boolean {
  const { filePath } = snapshot.item
  const editor = useEditorStore.getState()
  if (!documentRegistry.has(filePath)) {
    editor.openFileInTab(filePath, snapshot.diskContent ?? '')
  } else {
    editor.setActiveTab(filePath)
  }

  const current = documentRegistry.snapshot(filePath)
  if (!current) return false
  if (current.text === snapshot.content) return true
  return Boolean(
    useEditorStore.getState().updateActiveDocument(snapshot.content, 'history-restore')
  )
}

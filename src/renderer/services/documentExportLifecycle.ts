import { useCompileStore } from '../store/useCompileStore'
import { useEditorStore } from '../store/useEditorStore'
import { useNotificationStore } from '../store/useNotificationStore'
import { useProjectStore } from '../store/useProjectStore'
import { useUiStore } from '../store/useUiStore'
import { flushPendingDocumentEdits } from './pendingDocumentEdits'
import { syncRecoveryForFile } from './crashRecovery'
import { errorMessage } from '../utils/errorMessage'
import { documentRegistry, normalizeDocumentId } from '../models/documentRegistry'
import type { DocumentSnapshot } from '../models/documentModel'
import { projectPathKey } from './projectIndex'

const EXPORT_NOTIFICATION_ID = 'document-export'

export interface DocumentExportMessages {
  exporting: string
  complete: (outputPath: string) => string
  failed: string
  retry: string
}

export type DocumentExportOutcome = 'cancelled' | 'success' | 'error' | 'stale'

interface DocumentExportRequest {
  inputPath: string
  format: string
  messages: DocumentExportMessages
  projectRoot: string
  snapshot: DocumentSnapshot
  generation: number
}

interface QueuedDocumentExport {
  inputPath: string
  format: string
  messages: DocumentExportMessages
  key: string
  promise: Promise<DocumentExportOutcome>
}

let activeExport: Promise<DocumentExportOutcome> | null = null
let activeExportRequest: DocumentExportRequest | null = null
let queuedExport: QueuedDocumentExport | null = null
let exportGeneration = 0
let stopOwnerWatch: (() => void) | null = null

function sameDocumentPath(left: string | null, right: string): boolean {
  return left !== null && normalizeDocumentId(left) === normalizeDocumentId(right)
}

function exportRequestKey(inputPath: string, format: string): string {
  return `${normalizeDocumentId(inputPath)}\u0000${format.toLocaleLowerCase()}`
}

function isRequestCurrent(request: DocumentExportRequest): boolean {
  const editorState = useEditorStore.getState()
  const currentRoot = useProjectStore.getState().projectRoot
  return (
    request.generation === exportGeneration &&
    currentRoot !== null &&
    projectPathKey(currentRoot) === projectPathKey(request.projectRoot) &&
    sameDocumentPath(editorState.filePath, request.inputPath) &&
    (documentRegistry.getModel(request.inputPath)?.isCurrent(request.snapshot) ?? false)
  )
}

function clearOwnerWatch(): void {
  stopOwnerWatch?.()
  stopOwnerWatch = null
}

function clearStaleFeedback(request: DocumentExportRequest): void {
  if (request.generation !== exportGeneration) return
  exportGeneration += 1
  clearOwnerWatch()
  useUiStore.getState().setExportStatus('idle')
  useNotificationStore.getState().dismissNotification(EXPORT_NOTIFICATION_ID)
}

function watchRequestOwner(request: DocumentExportRequest): void {
  clearOwnerWatch()

  const invalidateIfStale = (): void => {
    if (!isRequestCurrent(request)) clearStaleFeedback(request)
  }
  const unwatchDocument =
    documentRegistry.getModel(request.inputPath)?.subscribe((event) => {
      if (event.kind === 'content' || event.kind === 'reload') invalidateIfStale()
    }) ?? (() => undefined)
  const unwatchEditor = useEditorStore.subscribe((state) => state.filePath, invalidateIfStale)
  const unwatchProject = useProjectStore.subscribe((state) => state.projectRoot, invalidateIfStale)
  const unwatchNotification = useNotificationStore.subscribe((state) => {
    const present = state.notifications.some((item) => item.id === EXPORT_NOTIFICATION_ID)
    if (!present) clearOwnerWatch()
  })

  stopOwnerWatch = () => {
    unwatchDocument()
    unwatchEditor()
    unwatchProject()
    unwatchNotification()
  }
}

function captureRequest(
  inputPath: string,
  format: string,
  messages: DocumentExportMessages
): DocumentExportRequest | null {
  flushPendingDocumentEdits(inputPath)
  const editorState = useEditorStore.getState()
  const projectRoot = useProjectStore.getState().projectRoot
  const snapshot = documentRegistry.snapshot(inputPath)
  if (!projectRoot || !snapshot || !sameDocumentPath(editorState.filePath, inputPath)) return null

  exportGeneration += 1
  return { inputPath, format, messages, projectRoot, snapshot, generation: exportGeneration }
}

function publishQueuedFeedback(messages: DocumentExportMessages): void {
  useNotificationStore.getState().pushNotification({
    id: EXPORT_NOTIFICATION_ID,
    message: messages.exporting,
    tone: 'progress',
    progress: null
  })
  useUiStore.getState().setExportStatus('exporting')
}

function queueDocumentExport(
  inputPath: string,
  format: string,
  messages: DocumentExportMessages
): Promise<DocumentExportOutcome> {
  const key = exportRequestKey(inputPath, format)
  publishQueuedFeedback(messages)

  if (queuedExport) {
    if (queuedExport.key === key) return queuedExport.promise
    // The task surface represents one serialized export. Repeated requests
    // dedupe; a different request replaces the not-yet-started entry so the
    // user's latest explicit choice wins without opening concurrent dialogs.
    queuedExport.inputPath = inputPath
    queuedExport.format = format
    queuedExport.messages = messages
    queuedExport.key = key
    return queuedExport.promise
  }

  const previous = activeExport
  if (!previous) return exportDocumentWithFeedback(inputPath, format, messages)

  const queuedPromise: Promise<DocumentExportOutcome> = previous.then(() => {
    const queued = queuedExport
    if (!queued || queued.promise !== queuedPromise) return 'stale'
    queuedExport = null
    return exportDocumentWithFeedback(queued.inputPath, queued.format, queued.messages)
  })
  queuedExport = { inputPath, format, messages, key, promise: queuedPromise }
  return queuedPromise
}

/**
 * Serializes the native save dialog/export operation and publishes it through
 * the shared task surface. Cancellation remains neutral; failures stay visible
 * with an in-place retry action.
 */
export function exportDocumentWithFeedback(
  inputPath: string,
  format: string,
  messages: DocumentExportMessages
): Promise<DocumentExportOutcome> {
  if (activeExport) {
    const key = exportRequestKey(inputPath, format)
    if (
      activeExportRequest &&
      isRequestCurrent(activeExportRequest) &&
      exportRequestKey(activeExportRequest.inputPath, activeExportRequest.format) === key
    ) {
      return activeExport
    }
    return queueDocumentExport(inputPath, format, messages)
  }

  const exportRequest = captureRequest(inputPath, format, messages)
  if (!exportRequest) {
    useUiStore.getState().setExportStatus('idle')
    useNotificationStore.getState().dismissNotification(EXPORT_NOTIFICATION_ID)
    return Promise.resolve('stale')
  }
  activeExportRequest = exportRequest

  const request = (async (): Promise<DocumentExportOutcome> => {
    const notifications = useNotificationStore.getState()
    notifications.pushNotification({
      id: EXPORT_NOTIFICATION_ID,
      message: messages.exporting,
      tone: 'progress',
      progress: null
    })
    useUiStore.getState().setExportStatus('exporting')
    watchRequestOwner(exportRequest)

    try {
      const saveResult = await window.api.saveFile(
        exportRequest.snapshot.text,
        exportRequest.inputPath
      )
      if (!saveResult.success) throw new Error('Could not save the document before export.')
      useEditorStore
        .getState()
        .markDocumentSaved(exportRequest.inputPath, exportRequest.snapshot.revision)
      await syncRecoveryForFile(exportRequest.inputPath).catch(() => undefined)
      if (!isRequestCurrent(exportRequest)) {
        clearStaleFeedback(exportRequest)
        return 'stale'
      }

      const result = await window.api.exportDocument(inputPath, format)
      if (!isRequestCurrent(exportRequest)) {
        clearStaleFeedback(exportRequest)
        return 'stale'
      }
      if (!result) {
        useUiStore.getState().setExportStatus('idle')
        useNotificationStore.getState().dismissNotification(EXPORT_NOTIFICATION_ID)
        clearOwnerWatch()
        return 'cancelled'
      }

      if (!result.success) {
        publishExportError(exportRequest)
        return 'error'
      }

      useUiStore.getState().setExportStatus('success')
      useNotificationStore.getState().updateNotification(EXPORT_NOTIFICATION_ID, {
        message: messages.complete(result.outputPath),
        tone: 'success',
        progress: 100,
        action: undefined
      })
      clearOwnerWatch()
      return 'success'
    } catch (error) {
      if (!isRequestCurrent(exportRequest)) {
        clearStaleFeedback(exportRequest)
        return 'stale'
      }
      useCompileStore.getState().appendLog(`Export failed: ${errorMessage(error)}\n`)
      publishExportError(exportRequest)
      return 'error'
    }
  })().finally(() => {
    if (activeExport === request) {
      activeExport = null
      activeExportRequest = null
    }
  })

  activeExport = request
  return request
}

function publishExportError(request: DocumentExportRequest): void {
  const { inputPath, format, messages } = request
  useUiStore.getState().setExportStatus('error')
  useNotificationStore.getState().updateNotification(EXPORT_NOTIFICATION_ID, {
    message: messages.failed,
    tone: 'error',
    progress: null,
    action: {
      label: messages.retry,
      run: async () => {
        if (!isRequestCurrent(request)) {
          clearStaleFeedback(request)
          return
        }
        await exportDocumentWithFeedback(inputPath, format, messages)
      },
      dismissOnRun: false
    }
  })
}

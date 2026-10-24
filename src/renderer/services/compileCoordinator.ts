import type { DocumentSnapshot } from '../models/documentModel'
import { documentRegistry } from '../models/documentRegistry'
import { useEditorStore } from '../store/useEditorStore'
import { useCompileStore } from '../store/useCompileStore'
import { usePdfStore } from '../store/usePdfStore'
import type {
  CompileIdentity,
  CompilePriority,
  CompileRequest,
  CompileResponse
} from '../../shared/compileProtocol'

export interface CompileTicket {
  readonly requestId: number
  readonly filePath: string
  readonly snapshot: DocumentSnapshot
  /** PDF workspace compiles of the root stay publishable while another file is active. */
  readonly detachedFromActiveTab: boolean
}

let nextRequestId = 0
let latestRequestId = 0
let latestTicket: CompileTicket | null = null
/** Set when the author stopped the latest compile; its output must never publish. */
let cancelledRequestId = 0
const pendingAutoCompileCancellationListeners = new Set<() => void>()

/** Cancels debounced or pre-save automatic work before an explicit compile starts. */
export function cancelPendingAutoCompile(): void {
  for (const listener of pendingAutoCompileCancellationListeners) listener()
}

export function onPendingAutoCompileCancellation(listener: () => void): () => void {
  pendingAutoCompileCancellationListeners.add(listener)
  return () => pendingAutoCompileCancellationListeners.delete(listener)
}

export interface CompileOptions {
  /** Build this open document instead of the active tab or the PDF workspace root. */
  rootPath?: string | null
}

export interface CompileTarget {
  filePath: string
  detachedFromActiveTab: boolean
}

/**
 * Chooses the document a compile builds. The PDF workspace always rebuilds the
 * document its PDF came from, whichever source file the drawer shows; callers
 * may also name an open root explicitly (a sentence edit in an included file).
 */
export function resolveCompileTarget(requestedRoot?: string | null): CompileTarget | null {
  const active = useEditorStore.getState().filePath
  const pdfRoot = useCompileStore.getState().pdfDocumentId
  const root =
    (requestedRoot ? documentRegistry.getFilePath(requestedRoot) : null) ??
    (usePdfStore.getState().pdfOnly && pdfRoot ? documentRegistry.getFilePath(pdfRoot) : null)
  const filePath = root ?? active
  if (!filePath?.toLowerCase().endsWith('.tex')) return null
  return { filePath, detachedFromActiveTab: filePath !== active }
}

/** Creates a renderer-side identity for one compile input revision. */
export function beginCompileTicket(
  filePath: string,
  snapshot: DocumentSnapshot,
  options: { detachedFromActiveTab?: boolean } = {}
): CompileTicket {
  nextRequestId += 1
  latestRequestId = nextRequestId
  latestTicket = Object.freeze({
    requestId: nextRequestId,
    filePath,
    snapshot,
    detachedFromActiveTab: options.detachedFromActiveTab ?? false
  })
  return latestTicket
}

export function isLatestCompileTicket(ticket: CompileTicket): boolean {
  return ticket.requestId === latestRequestId
}

export function isCompileTicketCancelled(ticket: CompileTicket): boolean {
  return ticket.requestId === cancelledRequestId
}

/**
 * Stops the compile the UI is currently showing. The native side kills the
 * compiler (or refuses the request if it has not started yet) and the pending
 * `compile` call rejects with `compilationCancelled`, which its caller treats
 * as a return to idle. The status flips immediately so the toolbar and preview
 * do not keep spinning while the child is being reaped, and the ticket is
 * marked so a response that was already in flight is dropped as stale.
 */
export async function cancelActiveCompile(): Promise<void> {
  const ticket = latestTicket
  if (!ticket || useCompileStore.getState().compileStatus !== 'compiling') return
  cancelledRequestId = ticket.requestId
  useCompileStore.getState().setCompileStatus('idle')
  try {
    await window.api.cancelCompile(ticket.requestId)
  } catch {
    // The compile either already finished (its result is dropped above) or the
    // native side could not be reached; neither leaves work to undo here.
  }
}

/** Results may publish only for the latest request and its exact input revision. */
export function canPublishCompileTicket(ticket: CompileTicket): boolean {
  return (
    isLatestCompileTicket(ticket) &&
    !isCompileTicketCancelled(ticket) &&
    (ticket.detachedFromActiveTab || useEditorStore.getState().filePath === ticket.filePath) &&
    (documentRegistry.getModel(ticket.filePath)?.isCurrent(ticket.snapshot) ?? false)
  )
}

export function toCompileRequest(ticket: CompileTicket, priority: CompilePriority): CompileRequest {
  return {
    requestId: ticket.requestId,
    documentId: ticket.snapshot.documentId,
    documentRevision: ticket.snapshot.revision,
    filePath: ticket.filePath,
    priority
  }
}

export function isCurrentCompileIdentity(identity: CompileIdentity): boolean {
  if (identity.requestId !== latestRequestId) return false
  const ownerPath = latestTicket?.detachedFromActiveTab
    ? latestTicket.filePath
    : useEditorStore.getState().filePath
  if (!ownerPath) return false
  const model = documentRegistry.getModel(ownerPath)
  return model?.documentId === identity.documentId && model.revision === identity.documentRevision
}

export function canPublishCompileResponse(
  ticket: CompileTicket,
  response: CompileResponse
): boolean {
  return (
    canPublishCompileTicket(ticket) &&
    response.requestId === ticket.requestId &&
    response.documentId === ticket.snapshot.documentId &&
    response.documentRevision === ticket.snapshot.revision
  )
}

export function resetCompileTicketsForTests(): void {
  nextRequestId = 0
  latestRequestId = 0
  latestTicket = null
  cancelledRequestId = 0
}

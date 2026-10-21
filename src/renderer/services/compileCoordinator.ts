import type { DocumentSnapshot } from '../models/documentModel'
import { documentRegistry } from '../models/documentRegistry'
import { useEditorStore } from '../store/useEditorStore'
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
const pendingAutoCompileCancellationListeners = new Set<() => void>()

/** Cancels debounced or pre-save automatic work before an explicit compile starts. */
export function cancelPendingAutoCompile(): void {
  for (const listener of pendingAutoCompileCancellationListeners) listener()
}

export function onPendingAutoCompileCancellation(listener: () => void): () => void {
  pendingAutoCompileCancellationListeners.add(listener)
  return () => pendingAutoCompileCancellationListeners.delete(listener)
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

/** Results may publish only for the latest request and its exact input revision. */
export function canPublishCompileTicket(ticket: CompileTicket): boolean {
  return (
    isLatestCompileTicket(ticket) &&
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
}

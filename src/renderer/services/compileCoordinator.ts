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
}

let nextRequestId = 0
let latestRequestId = 0

/** Creates a renderer-side identity for one compile input revision. */
export function beginCompileTicket(filePath: string, snapshot: DocumentSnapshot): CompileTicket {
  nextRequestId += 1
  latestRequestId = nextRequestId
  return Object.freeze({ requestId: nextRequestId, filePath, snapshot })
}

export function isLatestCompileTicket(ticket: CompileTicket): boolean {
  return ticket.requestId === latestRequestId
}

/** Results may publish only for the latest request and its exact input revision. */
export function canPublishCompileTicket(ticket: CompileTicket): boolean {
  return (
    isLatestCompileTicket(ticket) &&
    useEditorStore.getState().filePath === ticket.filePath &&
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
  const activeFilePath = useEditorStore.getState().filePath
  if (!activeFilePath) return false
  const model = documentRegistry.getModel(activeFilePath)
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
}

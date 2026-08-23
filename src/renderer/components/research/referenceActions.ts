import type { OnlineReference } from '../../../shared/types'
import type { ZoteroCollection } from '../../../shared/types'
import { useEditorStore } from '../../store/useEditorStore'
import { useProjectStore } from '../../store/useProjectStore'
import { queueBibliographyRegistration } from '../../services/bibliographyRegistration'
import { useSettingsStore } from '../../store/useSettingsStore'
import { documentRegistry } from '../../models/documentRegistry'

export const TEXTEX_REFERENCE_MIME = 'application/x-textex-reference'
export const TEXTEX_ZOTERO_COLLECTION_MIME = 'application/x-textex-zotero-collection'

export interface ZoteroCollectionDragPayload {
  collection: ZoteroCollection
  port?: number
}

export type ReferenceDragPayload =
  | { source: 'zotero'; citekey: string; port?: number }
  | { source: 'online'; reference: OnlineReference }

export async function addReferenceAndBuildCitation(payload: ReferenceDragPayload): Promise<string> {
  const targetFilePath = useEditorStore.getState().activeFilePath
  const targetSnapshot = targetFilePath ? documentRegistry.snapshot(targetFilePath) : null
  let result
  if (payload.source === 'zotero') {
    result = await window.api.zoteroAddToProject(payload.citekey, payload.port)
  } else if (useSettingsStore.getState().settings.citeOnlineToZotero) {
    const port = useSettingsStore.getState().settings.zoteroPort
    const saved = await window.api.zoteroSaveOnline(payload.reference, port)
    result = saved.citekey
      ? await window.api.zoteroAddToProject(saved.citekey, port)
      : await window.api.researchAddOnline(payload.reference)
  } else {
    result = await window.api.researchAddOnline(payload.reference)
  }
  const root = useProjectStore.getState().projectRoot
  if (root) {
    const entries = await window.api.findBibInProject(root)
    useProjectStore.getState().setBibEntries(entries)
    useProjectStore.getState().invalidateDirectory(root)
  }
  if (
    targetFilePath &&
    useEditorStore.getState().activeFilePath === targetFilePath &&
    targetSnapshot &&
    documentRegistry.getModel(targetFilePath)?.isCurrent(targetSnapshot)
  ) {
    queueBibliographyRegistration(result.filePath)
  }
  return `\\cite{${result.citekey}}`
}

export async function addReferenceAtCursor(payload: ReferenceDragPayload): Promise<void> {
  const start = useEditorStore.getState()
  const targetFilePath = start.activeFilePath
  const targetSnapshot = targetFilePath ? documentRegistry.snapshot(targetFilePath) : null
  const targetCursor = { line: start.cursorLine, column: start.cursorColumn }
  const citation = await addReferenceAndBuildCitation(payload)
  const current = useEditorStore.getState()
  if (
    !targetFilePath ||
    !targetSnapshot ||
    current.activeFilePath !== targetFilePath ||
    current.cursorLine !== targetCursor.line ||
    current.cursorColumn !== targetCursor.column ||
    !documentRegistry.getModel(targetFilePath)?.isCurrent(targetSnapshot)
  ) {
    return
  }
  current.requestInsertAtCursor(citation)
}

export function setReferenceDragData(event: React.DragEvent, payload: ReferenceDragPayload): void {
  event.dataTransfer.setData(TEXTEX_REFERENCE_MIME, JSON.stringify(payload))
  event.dataTransfer.effectAllowed = 'copy'
}

export function parseReferenceDragData(data: string): ReferenceDragPayload | null {
  try {
    const value = JSON.parse(data) as ReferenceDragPayload
    if (
      value?.source === 'zotero' &&
      typeof value.citekey === 'string' &&
      value.citekey.length > 0 &&
      value.citekey.length <= 512 &&
      (value.port === undefined ||
        (Number.isInteger(value.port) && value.port >= 1 && value.port <= 65_535))
    ) {
      return value
    }
    if (
      value?.source === 'online' &&
      value.reference &&
      typeof value.reference.title === 'string'
    ) {
      return value
    }
  } catch {
    // Ignore untrusted drag payloads.
  }
  return null
}

export function setZoteroCollectionDragData(
  event: React.DragEvent,
  payload: ZoteroCollectionDragPayload
): void {
  event.dataTransfer.setData(TEXTEX_ZOTERO_COLLECTION_MIME, JSON.stringify(payload))
  event.dataTransfer.effectAllowed = 'copy'
}

export function parseZoteroCollectionDragData(data: string): ZoteroCollectionDragPayload | null {
  try {
    const value = JSON.parse(data) as ZoteroCollectionDragPayload
    if (
      value?.collection &&
      typeof value.collection.key === 'string' &&
      value.collection.key.startsWith('/') &&
      typeof value.collection.name === 'string' &&
      Number.isInteger(value.collection.itemCount) &&
      value.collection.itemCount >= 0 &&
      (value.port === undefined ||
        (Number.isInteger(value.port) && value.port >= 1 && value.port <= 65_535))
    ) {
      return value
    }
  } catch {
    // Ignore untrusted drag payloads.
  }
  return null
}

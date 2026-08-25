import type { BibEntry, OnlineReference, ZoteroCollection } from '../../../shared/types'
import { isSafeCitationKey } from '../../../shared/referenceValidation'
import { useEditorStore } from '../../store/useEditorStore'
import { useProjectStore } from '../../store/useProjectStore'
import { queueBibliographyRegistration } from '../../services/bibliographyRegistration'
import { useSettingsStore } from '../../store/useSettingsStore'
import { documentRegistry } from '../../models/documentRegistry'

export const TEXTEX_REFERENCE_MIME = 'application/x-textex-reference'
export const TEXTEX_ZOTERO_COLLECTION_MIME = 'application/x-textex-zotero-collection'
export const MAX_REFERENCE_DRAG_BYTES = 384 * 1024

export interface ZoteroCollectionDragPayload {
  collection: ZoteroCollection
  port?: number
}

export interface ReferenceDragMetadata {
  title?: string
  authors?: string[]
  year?: string
  type?: string
  doi?: string
  arxivId?: string
  url?: string
  abstract?: string
}

export type ReferenceDragPayload =
  | { source: 'project'; citekey: string; metadata?: ReferenceDragMetadata }
  | { source: 'zotero'; citekey: string; port?: number; metadata?: ReferenceDragMetadata }
  | { source: 'online'; reference: OnlineReference }

export function buildProjectReferenceDragPayload(entry: BibEntry): ReferenceDragPayload {
  return {
    source: 'project',
    citekey: entry.key,
    metadata: {
      title: entry.title,
      authors: entry.author
        .split(/\s+and\s+/u)
        .map((author) => author.trim())
        .filter(Boolean),
      year: entry.year,
      type: entry.type
    }
  }
}

function isCurrentProject(root: string | null): boolean {
  return useProjectStore.getState().projectRoot === root
}

function assertCurrentProject(root: string | null): void {
  if (!isCurrentProject(root)) {
    throw new Error('The active project changed before the reference operation completed.')
  }
}

export async function addReferenceAndBuildCitation(payload: ReferenceDragPayload): Promise<string> {
  if (payload.source !== 'online' && !isSafeCitationKey(payload.citekey)) {
    throw new Error('The reference has an invalid citation key.')
  }
  const targetProjectRoot = useProjectStore.getState().projectRoot
  if (payload.source === 'project') {
    if (!targetProjectRoot) throw new Error('Open a project before inserting a citation.')
    const entries = await window.api.findBibInProject(targetProjectRoot)
    assertCurrentProject(targetProjectRoot)
    if (!entries.some((entry) => entry.key === payload.citekey)) {
      throw new Error(`The project bibliography no longer contains @${payload.citekey}.`)
    }
    return `\\cite{${payload.citekey}}`
  }
  const targetFilePath = useEditorStore.getState().activeFilePath
  const targetSnapshot = targetFilePath ? documentRegistry.snapshot(targetFilePath) : null
  let result
  if (payload.source === 'zotero') {
    result = await window.api.zoteroAddToProject(payload.citekey, payload.port)
  } else if (useSettingsStore.getState().settings.citeOnlineToZotero) {
    const port = useSettingsStore.getState().settings.zoteroPort
    const saved = await window.api.zoteroSaveOnline(payload.reference, port)
    assertCurrentProject(targetProjectRoot)
    result = saved.citekey
      ? await window.api.zoteroAddToProject(saved.citekey, port)
      : await window.api.researchAddOnline(payload.reference)
  } else {
    result = await window.api.researchAddOnline(payload.reference)
  }
  assertCurrentProject(targetProjectRoot)
  if (targetProjectRoot) {
    const entries = await window.api.findBibInProject(targetProjectRoot)
    assertCurrentProject(targetProjectRoot)
    useProjectStore.getState().setBibEntries(entries)
    useProjectStore.getState().invalidateDirectory(targetProjectRoot)
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

export async function addReferenceAtCursor(payload: ReferenceDragPayload): Promise<boolean> {
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
    return false
  }
  current.requestInsertAtCursor(citation)
  return true
}

export function setReferenceDragData(
  event: React.DragEvent,
  payload: ReferenceDragPayload
): boolean {
  if (payload.source !== 'online' && !isSafeCitationKey(payload.citekey)) {
    event.dataTransfer.effectAllowed = 'none'
    return false
  }
  event.dataTransfer.setData(TEXTEX_REFERENCE_MIME, JSON.stringify(payload))
  if (payload.source !== 'online') {
    event.dataTransfer.setData('text/plain', `\\cite{${payload.citekey}}`)
  }
  event.dataTransfer.effectAllowed = 'copy'
  return true
}

export function parseReferenceDragData(data: string): ReferenceDragPayload | null {
  if (utf8ByteLength(data) > MAX_REFERENCE_DRAG_BYTES) return null
  try {
    const value = JSON.parse(data) as unknown
    if (
      isRecord(value) &&
      (value.source === 'project' || value.source === 'zotero') &&
      isSafeCitationKey(value.citekey) &&
      (value.source === 'project' || isOptionalPort(value.port))
    ) {
      const metadata = parseReferenceMetadata(value.metadata)
      if (value.metadata !== undefined && !metadata) return null
      if (value.source === 'project') {
        return {
          source: 'project',
          citekey: value.citekey,
          ...(metadata ? { metadata } : {})
        }
      }
      return {
        source: 'zotero',
        citekey: value.citekey,
        ...(typeof value.port === 'number' ? { port: value.port } : {}),
        ...(metadata ? { metadata } : {})
      }
    }
    if (isRecord(value) && value.source === 'online') {
      const reference = parseOnlineReference(value.reference)
      if (reference) return { source: 'online', reference }
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
  if (data.length > 32_768) return null
  try {
    const value = JSON.parse(data) as unknown
    if (
      isRecord(value) &&
      isRecord(value.collection) &&
      typeof value.collection.key === 'string' &&
      value.collection.key.length <= 2_048 &&
      value.collection.key.startsWith('/') &&
      !hasControlCharacters(value.collection.key) &&
      !Array.from(value.collection.key).some((character) => '?#&'.includes(character)) &&
      typeof value.collection.name === 'string' &&
      value.collection.name.length <= 16_384 &&
      (value.collection.parentKey === undefined ||
        value.collection.parentKey === null ||
        (typeof value.collection.parentKey === 'string' &&
          value.collection.parentKey.length <= 2_048)) &&
      (value.collection.itemCount === null ||
        (typeof value.collection.itemCount === 'number' &&
          Number.isInteger(value.collection.itemCount) &&
          value.collection.itemCount >= 0)) &&
      (value.port === undefined ||
        (typeof value.port === 'number' &&
          Number.isInteger(value.port) &&
          value.port >= 1 &&
          value.port <= 65_535))
    ) {
      return {
        collection: {
          key: value.collection.key,
          name: value.collection.name,
          parentKey:
            typeof value.collection.parentKey === 'string' ? value.collection.parentKey : null,
          itemCount:
            typeof value.collection.itemCount === 'number' ? value.collection.itemCount : null
        },
        ...(typeof value.port === 'number' ? { port: value.port } : {})
      }
    }
  } catch {
    // Ignore untrusted drag payloads.
  }
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint < 32 || codePoint === 127
  })
}

function hasUnsafeTextControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return (
      (codePoint < 32 && character !== '\n' && character !== '\r' && character !== '\t') ||
      codePoint === 127
    )
  })
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function isSafeRequiredString(value: unknown, maxBytes: number): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    utf8ByteLength(value) <= maxBytes &&
    !hasControlCharacters(value)
  )
}

function isSafeOptionalText(
  value: unknown,
  maxBytes: number,
  allowTextWhitespace = false
): value is string | undefined {
  return (
    value === undefined ||
    (typeof value === 'string' &&
      utf8ByteLength(value) <= maxBytes &&
      !(allowTextWhitespace ? hasUnsafeTextControlCharacters(value) : hasControlCharacters(value)))
  )
}

function isOptionalPort(value: unknown): value is number | undefined {
  return (
    value === undefined ||
    (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65_535)
  )
}

function isSafeHttpUrl(value: string | undefined): boolean {
  if (value === undefined || value.length === 0) return true
  try {
    const url = new URL(value)
    const authority = value.match(/^[A-Za-z][A-Za-z0-9+.-]*:\/\/([^/?#]*)/u)?.[1] ?? ''
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      !authority.includes('@')
    )
  } catch {
    return false
  }
}

function parseReferenceMetadata(value: unknown): ReferenceDragMetadata | null {
  if (!isRecord(value)) return null
  if (
    !isSafeOptionalText(value.title, 16 * 1024, true) ||
    !isSafeOptionalText(value.year, 32) ||
    !isSafeOptionalText(value.type, 128) ||
    !isSafeOptionalText(value.doi, 2_048) ||
    !isSafeOptionalText(value.arxivId, 2_048) ||
    !isSafeOptionalText(value.url, 4_096) ||
    !isSafeOptionalText(value.abstract, 256 * 1024, true) ||
    (value.url !== undefined && !isSafeHttpUrl(value.url)) ||
    (value.authors !== undefined &&
      (!Array.isArray(value.authors) ||
        value.authors.length > 256 ||
        !value.authors.every((author) => isSafeRequiredString(author, 2_048))))
  ) {
    return null
  }
  return {
    ...(typeof value.title === 'string' ? { title: value.title } : {}),
    ...(Array.isArray(value.authors) ? { authors: value.authors as string[] } : {}),
    ...(typeof value.year === 'string' ? { year: value.year } : {}),
    ...(typeof value.type === 'string' ? { type: value.type } : {}),
    ...(typeof value.doi === 'string' ? { doi: value.doi } : {}),
    ...(typeof value.arxivId === 'string' ? { arxivId: value.arxivId } : {}),
    ...(typeof value.url === 'string' ? { url: value.url } : {}),
    ...(typeof value.abstract === 'string' ? { abstract: value.abstract } : {})
  }
}

function parseOnlineReference(value: unknown): OnlineReference | null {
  if (!isRecord(value) || (value.source !== 'crossref' && value.source !== 'arxiv')) return null
  const metadata = parseReferenceMetadata(value)
  if (
    !metadata ||
    !isSafeRequiredString(value.id, 2_048) ||
    !isSafeRequiredString(value.title, 16 * 1024) ||
    !Array.isArray(value.authors) ||
    !isSafeOptionalText(value.year, 32) ||
    typeof value.year !== 'string' ||
    !isSafeRequiredString(value.type, 128)
  ) {
    return null
  }
  return {
    source: value.source,
    id: value.id,
    title: value.title,
    authors: metadata.authors ?? [],
    year: value.year,
    type: value.type,
    ...(metadata.doi !== undefined ? { doi: metadata.doi } : {}),
    ...(metadata.arxivId !== undefined ? { arxivId: metadata.arxivId } : {}),
    ...(metadata.url !== undefined ? { url: metadata.url } : {}),
    ...(metadata.abstract !== undefined ? { abstract: metadata.abstract } : {})
  }
}

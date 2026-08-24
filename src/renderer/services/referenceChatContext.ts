import type { OnlineReference } from '../../shared/types'
import { isSafeCitationKey } from '../../shared/referenceValidation'
import type {
  ReferenceDragMetadata,
  ReferenceDragPayload
} from '../components/research/referenceActions'

export const MAX_DROPPED_REFERENCE_CONTEXTS = 12

export type ReferenceChatDescriptor =
  | { source: 'project'; citekey: string }
  | { source: 'zotero'; citekey: string; port?: number }
  | { source: 'online'; reference: OnlineReference }

/**
 * Renderer state for one reference attached to Chat. `display` is deliberately
 * separate from `descriptor`: native code must resolve project/Zotero records,
 * and must validate online metadata again, rather than trusting display text.
 */
export interface ReferenceChatContextItem {
  id: string
  label: string
  descriptor: ReferenceChatDescriptor
  display: ReferenceDragMetadata
}

export function buildReferenceChatContext(payload: ReferenceDragPayload): ReferenceChatContextItem {
  if (payload.source === 'online') {
    const reference = { ...payload.reference, authors: [...payload.reference.authors] }
    return {
      id: stableOnlineId(reference),
      label: reference.title.trim(),
      descriptor: { source: 'online', reference },
      display: onlineDisplayMetadata(reference)
    }
  }

  if (!isSafeCitationKey(payload.citekey)) {
    throw new Error('The reference has an invalid citation key.')
  }

  const label = payload.metadata?.title?.trim() || `@${payload.citekey}`
  return {
    id: stableCitekeyId(payload.source, payload.citekey),
    label,
    descriptor: {
      source: payload.source,
      citekey: payload.citekey,
      ...(payload.source === 'zotero' && payload.port !== undefined ? { port: payload.port } : {})
    },
    display: payload.metadata ?? {}
  }
}

/** Adds or replaces a reference by stable identity while preserving order. */
export function mergeReferenceChatContexts(
  current: readonly ReferenceChatContextItem[],
  incoming: ReferenceChatContextItem,
  limit = MAX_DROPPED_REFERENCE_CONTEXTS
): ReferenceChatContextItem[] {
  if (!Number.isSafeInteger(limit) || limit < 1) return [...current]
  const existingIndex = current.findIndex((item) => item.id === incoming.id)
  if (existingIndex >= 0) {
    return current.map((item, index) => (index === existingIndex ? incoming : item))
  }
  if (current.length >= limit) return [...current]
  return [...current, incoming]
}

function stableCitekeyId(source: 'project' | 'zotero', citekey: string): string {
  return boundedStableId(`reference:${source}:citekey`, citekey.trim().toLocaleLowerCase('en-US'))
}

function stableOnlineId(reference: OnlineReference): string {
  const doi = normalizeDoi(reference.doi)
  if (doi) return boundedStableId('reference:doi', doi)
  const arxivId = normalizeArxivId(reference.arxivId)
  if (arxivId) return boundedStableId('reference:arxiv', arxivId)
  return boundedStableId(
    `reference:${reference.source}:id`,
    reference.id.trim().toLocaleLowerCase('en-US')
  )
}

function boundedStableId(namespace: string, identity: string): string {
  const readable = `${namespace}:${encodeURIComponent(identity)}`
  if (readable.length <= 128) return readable
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < identity.length; index += 1) {
    const code = identity.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ code, 0x85ebca6b)
  }
  const hash = `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0)
    .toString(16)
    .padStart(8, '0')}`
  return `${namespace}:hash:${hash}`
}

function normalizeDoi(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, '')
    .replace(/^doi:\s*/iu, '')
    .toLocaleLowerCase('en-US')
}

function normalizeArxivId(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .replace(/^arxiv:\s*/iu, '')
    .replace(/v\d+$/iu, '')
    .toLocaleLowerCase('en-US')
}

function onlineDisplayMetadata(reference: OnlineReference): ReferenceDragMetadata {
  return {
    title: reference.title,
    authors: [...reference.authors],
    year: reference.year,
    type: reference.type,
    ...(reference.doi !== undefined ? { doi: reference.doi } : {}),
    ...(reference.arxivId !== undefined ? { arxivId: reference.arxivId } : {}),
    ...(reference.url !== undefined ? { url: reference.url } : {}),
    ...(reference.abstract !== undefined ? { abstract: reference.abstract } : {})
  }
}

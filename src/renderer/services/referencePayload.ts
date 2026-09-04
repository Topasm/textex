import type { OnlineReference } from '../../shared/types'

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

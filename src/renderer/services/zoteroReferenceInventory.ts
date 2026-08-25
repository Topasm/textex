import type { CitationUsage, ZoteroCollectionItem } from '../../shared/types'
import { documentRegistry } from '../models/documentRegistry'
import { overlayCitationUsages } from './citationUsageOverlay'

const SYNC_PAGE_SIZE = 100
const MAX_SYNC_PREVIEW_ITEMS = 10_000

export async function loadAllZoteroCollectionItems(
  collectionKey: string,
  port: number
): Promise<ZoteroCollectionItem[]> {
  const items: ZoteroCollectionItem[] = []
  const seenItemKeys = new Set<string>()
  let total = 1
  while (items.length < total && items.length < MAX_SYNC_PREVIEW_ITEMS) {
    const previousLength = items.length
    const page = await window.api.zoteroCollectionItems(
      collectionKey,
      items.length,
      SYNC_PAGE_SIZE,
      port
    )
    total = page.totalResults
    if (page.items.length === 0) break
    for (const item of page.items) {
      if (seenItemKeys.has(item.itemKey)) continue
      seenItemKeys.add(item.itemKey)
      items.push(item)
    }
    if (items.length === previousLength) break
  }
  if (total > MAX_SYNC_PREVIEW_ITEMS) {
    throw new Error(
      `Reference cross-check is limited to ${MAX_SYNC_PREVIEW_ITEMS.toLocaleString()} Zotero items.`
    )
  }
  return items
}

export async function scanCurrentCitationUsages(projectRoot: string): Promise<CitationUsage[]> {
  const base = await window.api.scanCitations(projectRoot)
  const dirtyDocuments = documentRegistry
    .dirtySnapshots()
    .filter(({ filePath }) => filePath.toLocaleLowerCase('en-US').endsWith('.tex'))
  const overlays = await Promise.all(
    dirtyDocuments.map(async ({ filePath, snapshot }) => {
      const savedText = await window.api.readFile(filePath).then(
        (result) => result.content,
        () => ''
      )
      return { filePath, savedText, currentText: snapshot.text }
    })
  )
  return overlayCitationUsages(base, overlays)
}

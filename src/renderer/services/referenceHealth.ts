import type { BibEntry, CitationUsage, ZoteroCollectionItem } from '../../shared/types'

export type ReferenceMatchKind = 'doi' | 'arxiv' | 'citekey'

export interface ProjectReferenceHealth {
  entry: BibEntry
  citationCount: number
  zoteroItem: ZoteroCollectionItem | null
  matchKind: ReferenceMatchKind | null
  possibleMatch: ZoteroCollectionItem | null
}

export interface ZoteroReferenceHealth {
  item: ZoteroCollectionItem
  projectEntry: BibEntry | null
  citationCount: number
  matchKind: ReferenceMatchKind | null
}

export interface ReferenceHealthSnapshot {
  project: ProjectReferenceHealth[]
  zotero: ZoteroReferenceHealth[]
  missingCitations: CitationUsage[]
  citedCount: number
  bibliographyCount: number
  linkedToZoteroCount: number
  projectOnlyCount: number
  unusedCount: number
  zoteroOnlyCount: number
}

export function buildReferenceHealth(
  bibliography: BibEntry[],
  citations: CitationUsage[],
  zoteroItems: ZoteroCollectionItem[]
): ReferenceHealthSnapshot {
  const citationsByKey = new Map(citations.map((usage) => [usage.citekey, usage.count]))
  const bibliographyKeys = new Set(bibliography.map((entry) => entry.key))
  const missingCitations = citations.filter((usage) => !bibliographyKeys.has(usage.citekey))
  const availableZotero = new Set(zoteroItems.map((item) => item.itemKey))
  const byDoi = uniqueIndex(zoteroItems, (item) => normalizeDoi(item.doi))
  const byArxiv = uniqueIndex(zoteroItems, (item) => normalizeArxiv(item.arxivId))
  const byCitekey = uniqueIndex(zoteroItems, (item) => item.citekey?.trim() ?? '')
  const byTitleYear = uniqueIndex(zoteroItems, (item) => titleYearKey(item.title, item.year))

  const project = bibliography.map((entry): ProjectReferenceHealth => {
    const exact = findExactMatch(entry, availableZotero, byDoi, byArxiv, byCitekey)
    if (exact.item) availableZotero.delete(exact.item.itemKey)
    const possibleCandidate = exact.item
      ? null
      : (byTitleYear.get(titleYearKey(entry.title, entry.year)) ?? null)
    const possibleMatch =
      possibleCandidate && availableZotero.has(possibleCandidate.itemKey) ? possibleCandidate : null
    return {
      entry,
      citationCount: citationsByKey.get(entry.key) ?? 0,
      zoteroItem: exact.item,
      matchKind: exact.kind,
      possibleMatch
    }
  })

  const projectByZoteroKey = new Map(
    project.flatMap((status) =>
      status.zoteroItem ? ([[status.zoteroItem.itemKey, status]] as const) : []
    )
  )
  const zotero = zoteroItems.map((item): ZoteroReferenceHealth => {
    const match = projectByZoteroKey.get(item.itemKey)
    return {
      item,
      projectEntry: match?.entry ?? null,
      citationCount: match?.citationCount ?? 0,
      matchKind: match?.matchKind ?? null
    }
  })
  const linkedToZoteroCount = project.filter((status) => status.zoteroItem !== null).length
  const unusedCount = project.filter((status) => status.citationCount === 0).length

  return {
    project,
    zotero,
    missingCitations,
    citedCount: citations.filter((usage) => bibliographyKeys.has(usage.citekey)).length,
    bibliographyCount: bibliography.length,
    linkedToZoteroCount,
    projectOnlyCount: bibliography.length - linkedToZoteroCount,
    unusedCount,
    zoteroOnlyCount: zotero.filter((status) => status.projectEntry === null).length
  }
}

function findExactMatch(
  entry: BibEntry,
  available: Set<string>,
  byDoi: Map<string, ZoteroCollectionItem>,
  byArxiv: Map<string, ZoteroCollectionItem>,
  byCitekey: Map<string, ZoteroCollectionItem>
): { item: ZoteroCollectionItem | null; kind: ReferenceMatchKind | null } {
  const candidates: Array<[ReferenceMatchKind, ZoteroCollectionItem | undefined]> = [
    ['doi', byDoi.get(normalizeDoi(entry.doi))],
    ['arxiv', byArxiv.get(normalizeArxiv(entry.arxivId))],
    ['citekey', byCitekey.get(entry.key.trim())]
  ]
  for (const [kind, item] of candidates) {
    if (item && available.has(item.itemKey)) return { item, kind }
  }
  return { item: null, kind: null }
}

function uniqueIndex<T>(items: T[], keyFor: (item: T) => string): Map<string, T> {
  const index = new Map<string, T | null>()
  for (const item of items) {
    const key = keyFor(item)
    if (!key) continue
    index.set(key, index.has(key) ? null : item)
  }
  return new Map([...index].flatMap(([key, item]) => (item ? [[key, item] as const] : [])))
}

export function normalizeDoi(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/^doi:\s*/u, '')
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//u, '')
    .replace(/\s+/gu, '')
}

export function normalizeArxiv(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/^arxiv:\s*/u, '')
    .replace(/^https?:\/\/arxiv\.org\/(?:abs|pdf)\//u, '')
    .replace(/\.pdf$/u, '')
}

export function normalizeTitle(value: string): string {
  return value
    .toLocaleLowerCase('en-US')
    .replace(/\\[a-z]+\*?(?:\[[^\]]*\])?/giu, ' ')
    .replace(/[{}]/gu, '')
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function titleYearKey(title: string, year: string): string {
  const normalizedTitle = normalizeTitle(title)
  const normalizedYear = year.trim()
  return normalizedTitle && normalizedYear ? `${normalizedTitle}\u0000${normalizedYear}` : ''
}

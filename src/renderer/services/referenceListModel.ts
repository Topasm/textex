import type {
  BibEntry,
  CitationLocation,
  ReferenceSortOrder,
  ZoteroCollectionItem,
  ZoteroSearchResult
} from '../../shared/types'
import type {
  ReferenceDuplicate,
  ReferenceHealthSnapshot,
  ReferenceMatchKind
} from './referenceHealth'

/**
 * One list, one row type. The panel used to stack five conditional card groups
 * in a single scroll container — collection items, project bibliography, broken
 * citations, project search hits and Zotero search hits — with no heading
 * between them and a different sort order in each. Everything now flows through
 * this model so a paper appears exactly once, however many sources describe it.
 */

/** Where a row stands relative to the current paper, in escalating usefulness. */
export type ReferenceOrigin = 'missing' | 'zotero' | 'bibliography' | 'cited'

export type ReferenceFilter = 'all' | 'cited' | 'missing' | 'unused' | 'zotero'

export interface ReferenceRow {
  /** Stable across renders and unique within a list. */
  id: string
  citekey: string | null
  itemKey: string | null
  title: string
  author: string
  year: string
  origin: ReferenceOrigin
  citationCount: number
  citationLocations: CitationLocation[]
  possibleDuplicates: ReferenceDuplicate[]
  possibleMatch: ZoteroCollectionItem | null
  matchKind: ReferenceMatchKind | null
  entry: BibEntry | null
  zoteroItem: ZoteroCollectionItem | null
  /** True when the row exists only as a `\cite` key with no bibliography entry. */
  broken: boolean
  /** True when the row can be dragged and cited — it has a usable citekey. */
  citable: boolean
}

export interface ReferenceListInput {
  health: ReferenceHealthSnapshot
  /** Items of the collection currently being browsed. */
  inventory: ZoteroCollectionItem[]
  /** Zotero search hits, only meaningful while a query is active. */
  searchResults: ZoteroSearchResult[]
  query: string
  filter: ReferenceFilter
  sort: ReferenceSortOrder
  /** Suppresses the Zotero-side rows while the library cross-check is unusable. */
  zoteroReady: boolean
}

const ORIGIN_RANK: Record<ReferenceOrigin, number> = {
  cited: 0,
  bibliography: 1,
  zotero: 2,
  missing: 3
}

export interface ReferenceFilterCounts {
  all: number
  cited: number
  missing: number
  unused: number
  zotero: number
}

/** Every row the current sources describe, merged and query-narrowed but unfiltered. */
export function collectReferenceRows(input: ReferenceListInput): ReferenceRow[] {
  const normalizedQuery = input.query.trim().toLocaleLowerCase('en-US')
  return normalizedQuery ? searchRows(input, normalizedQuery) : browseRows(input)
}

export function filterAndSortReferenceRows(
  rows: ReferenceRow[],
  filter: ReferenceFilter,
  sort: ReferenceSortOrder,
  zoteroReady: boolean
): ReferenceRow[] {
  return sortRows(
    rows.filter((row) => matchesFilter(row, filter, zoteroReady)),
    sort
  )
}

/** Counts for the filter chips, taken from the same rows the list will show. */
export function countReferenceRows(
  rows: ReferenceRow[],
  zoteroReady: boolean
): ReferenceFilterCounts {
  return {
    all: rows.length,
    cited: rows.filter((row) => matchesFilter(row, 'cited', zoteroReady)).length,
    missing: rows.filter((row) => matchesFilter(row, 'missing', zoteroReady)).length,
    unused: rows.filter((row) => matchesFilter(row, 'unused', zoteroReady)).length,
    zotero: rows.filter((row) => matchesFilter(row, 'zotero', zoteroReady)).length
  }
}

export function buildReferenceRows(input: ReferenceListInput): ReferenceRow[] {
  return filterAndSortReferenceRows(
    collectReferenceRows(input),
    input.filter,
    input.sort,
    input.zoteroReady
  )
}

/** Rows shown with no active query: the collection, the bibliography, and gaps. */
function browseRows(input: ReferenceListInput): ReferenceRow[] {
  const merge = new ReferenceMerge()
  for (const status of input.health.project) {
    merge.add(projectRow(status))
  }
  for (const item of input.inventory) {
    merge.add(zoteroRow(item))
  }
  for (const usage of input.health.missingCitations) {
    merge.add({
      id: `missing:${usage.citekey}`,
      citekey: usage.citekey,
      itemKey: null,
      title: `@${usage.citekey}`,
      author: '',
      year: '',
      origin: 'missing',
      citationCount: usage.count,
      citationLocations: usage.locations ?? [],
      possibleDuplicates: [],
      possibleMatch: null,
      matchKind: null,
      entry: null,
      zoteroItem: null,
      broken: true,
      citable: false
    })
  }
  return merge.rows()
}

/**
 * Rows shown while searching: local rows narrowed by the query, then whatever
 * Zotero returned. Search hits are never re-filtered locally — Zotero matches
 * abstracts, tags and full text, so a local substring test would throw away
 * legitimate answers the user just asked for.
 */
function searchRows(input: ReferenceListInput, normalizedQuery: string): ReferenceRow[] {
  const merge = new ReferenceMerge()
  for (const status of input.health.project) {
    const row = projectRow(status)
    if (matchesQuery(row, normalizedQuery)) merge.add(row)
  }
  for (const item of input.inventory) {
    const row = zoteroRow(item)
    if (matchesQuery(row, normalizedQuery)) merge.add(row)
  }
  for (const result of input.searchResults) {
    merge.add({
      id: `search:${result.citekey}`,
      citekey: result.citekey,
      itemKey: null,
      title: result.title || result.citekey,
      author: result.author,
      year: result.year,
      origin: 'zotero',
      citationCount: 0,
      citationLocations: [],
      possibleDuplicates: [],
      possibleMatch: null,
      matchKind: null,
      entry: null,
      zoteroItem: null,
      broken: false,
      citable: true
    })
  }
  return merge.rows()
}

function projectRow(status: ReferenceHealthSnapshot['project'][number]): ReferenceRow {
  return {
    id: `project:${status.entry.key}`,
    citekey: status.entry.key,
    itemKey: status.zoteroItem?.itemKey ?? null,
    title: status.entry.title || status.entry.key,
    author: status.entry.author,
    year: status.entry.year,
    origin: status.citationCount > 0 ? 'cited' : 'bibliography',
    citationCount: status.citationCount,
    citationLocations: status.citationLocations,
    possibleDuplicates: status.possibleDuplicates,
    possibleMatch: status.possibleMatch,
    matchKind: status.matchKind,
    entry: status.entry,
    zoteroItem: status.zoteroItem,
    broken: false,
    citable: true
  }
}

function zoteroRow(item: ZoteroCollectionItem): ReferenceRow {
  return {
    id: `zotero:${item.itemKey}`,
    citekey: item.citekey,
    itemKey: item.itemKey,
    title: item.title,
    author: item.author,
    year: item.year,
    origin: 'zotero',
    citationCount: 0,
    citationLocations: [],
    possibleDuplicates: [],
    possibleMatch: null,
    matchKind: null,
    entry: null,
    zoteroItem: item,
    broken: false,
    citable: item.citekey !== null
  }
}

/**
 * Collapses the sources into one row per paper. Merging on both keys is what
 * fixes the old panel's duplicates: it de-duplicated on `itemKey` alone and only
 * across the loaded page, so the same paper reappeared once its Zotero match
 * failed or its collection page had not been fetched yet.
 */
class ReferenceMerge {
  private readonly ordered: ReferenceRow[] = []
  private readonly byItemKey = new Map<string, number>()
  private readonly byCitekey = new Map<string, number>()

  add(row: ReferenceRow): void {
    const existingIndex = this.indexOf(row)
    if (existingIndex === undefined) {
      const index = this.ordered.length
      this.ordered.push(row)
      this.index(row, index)
      return
    }
    const merged = mergeRows(this.ordered[existingIndex], row)
    this.ordered[existingIndex] = merged
    this.index(merged, existingIndex)
  }

  rows(): ReferenceRow[] {
    return this.ordered
  }

  private indexOf(row: ReferenceRow): number | undefined {
    if (row.itemKey) {
      const byItem = this.byItemKey.get(row.itemKey)
      if (byItem !== undefined) return byItem
    }
    const citekey = normalizeCitekey(row.citekey)
    return citekey ? this.byCitekey.get(citekey) : undefined
  }

  private index(row: ReferenceRow, index: number): void {
    if (row.itemKey) this.byItemKey.set(row.itemKey, index)
    const citekey = normalizeCitekey(row.citekey)
    if (citekey) this.byCitekey.set(citekey, index)
  }
}

/** The richer source wins per field; the strongest origin wins overall. */
function mergeRows(existing: ReferenceRow, incoming: ReferenceRow): ReferenceRow {
  const primary = ORIGIN_RANK[incoming.origin] < ORIGIN_RANK[existing.origin] ? incoming : existing
  const secondary = primary === existing ? incoming : existing
  return {
    ...primary,
    citekey: primary.citekey ?? secondary.citekey,
    itemKey: primary.itemKey ?? secondary.itemKey,
    title: primary.title || secondary.title,
    author: primary.author || secondary.author,
    year: primary.year || secondary.year,
    citationCount: Math.max(primary.citationCount, secondary.citationCount),
    citationLocations: primary.citationLocations.length
      ? primary.citationLocations
      : secondary.citationLocations,
    possibleDuplicates: primary.possibleDuplicates.length
      ? primary.possibleDuplicates
      : secondary.possibleDuplicates,
    possibleMatch: primary.possibleMatch ?? secondary.possibleMatch,
    matchKind: primary.matchKind ?? secondary.matchKind,
    entry: primary.entry ?? secondary.entry,
    zoteroItem: primary.zoteroItem ?? secondary.zoteroItem,
    broken: primary.broken && secondary.broken,
    citable: primary.citable || secondary.citable
  }
}

function matchesFilter(row: ReferenceRow, filter: ReferenceFilter, zoteroReady: boolean): boolean {
  switch (filter) {
    case 'cited':
      return row.citationCount > 0
    case 'missing':
      return row.broken || (zoteroReady && row.entry !== null && row.zoteroItem === null)
    case 'unused':
      return row.entry !== null && row.citationCount === 0
    case 'zotero':
      return row.zoteroItem !== null || row.itemKey !== null
    default:
      return true
  }
}

function matchesQuery(row: ReferenceRow, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true
  return [row.citekey ?? '', row.title, row.author, row.year].some((value) =>
    value.toLocaleLowerCase('en-US').includes(normalizedQuery)
  )
}

function sortRows(rows: ReferenceRow[], sort: ReferenceSortOrder): ReferenceRow[] {
  if (sort === 'natural') return rows
  const collator = new Intl.Collator('en-US', { sensitivity: 'base', numeric: true })
  return [...rows].sort((left, right) => {
    switch (sort) {
      case 'title':
        return collator.compare(left.title, right.title)
      case 'author':
        return (
          collator.compare(left.author, right.author) || collator.compare(left.title, right.title)
        )
      case 'year':
        // Newest first, and undated rows sink instead of leading the list.
        return (
          (Number(right.year) || 0) - (Number(left.year) || 0) ||
          collator.compare(left.title, right.title)
        )
      case 'citations':
        return right.citationCount - left.citationCount || collator.compare(left.title, right.title)
      default:
        return 0
    }
  })
}

function normalizeCitekey(citekey: string | null): string {
  return (citekey ?? '').trim().toLocaleLowerCase('en-US')
}

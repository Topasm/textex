import { describe, expect, it } from 'vitest'
import {
  buildReferenceRows,
  type ReferenceListInput
} from '../../renderer/services/referenceListModel'
import { buildReferenceHealth } from '../../renderer/services/referenceHealth'
import type { BibEntry, CitationUsage, ZoteroCollectionItem } from '../../shared/types'

function entry(overrides: Partial<BibEntry> = {}): BibEntry {
  return {
    key: 'zhang2025laps',
    type: 'article',
    title: 'Latent Action Primitive Segmentation',
    author: 'Zhang, Jiajie',
    year: '2025',
    ...overrides
  }
}

function item(overrides: Partial<ZoteroCollectionItem> = {}): ZoteroCollectionItem {
  return {
    itemKey: 'ABCD2345',
    citekey: 'zhang2025laps',
    title: 'Latent Action Primitive Segmentation',
    author: 'Zhang, Jiajie',
    year: '2025',
    type: 'conferencePaper',
    doi: null,
    arxivId: null,
    ...overrides
  }
}

function input(overrides: Partial<ReferenceListInput> = {}): ReferenceListInput {
  const bibliography = overrides.health ? [] : [entry()]
  const citations: CitationUsage[] = []
  return {
    health: buildReferenceHealth(bibliography, citations, []),
    inventory: [],
    searchResults: [],
    query: '',
    filter: 'all',
    sort: 'natural',
    zoteroReady: true,
    ...overrides
  }
}

describe('buildReferenceRows', () => {
  it('shows a paper once when the bibliography and the collection both describe it', () => {
    const rows = buildReferenceRows(
      input({
        health: buildReferenceHealth([entry()], [], [item()]),
        inventory: [item()]
      })
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].citekey).toBe('zhang2025laps')
    expect(rows[0].itemKey).toBe('ABCD2345')
    expect(rows[0].entry).not.toBeNull()
    expect(rows[0].zoteroItem).not.toBeNull()
  })

  it('still merges on the citekey when the Zotero cross-check found no match', () => {
    // The library inventory is empty, so `buildReferenceHealth` links nothing —
    // the old panel de-duplicated on itemKey alone and rendered this twice.
    const rows = buildReferenceRows(
      input({
        health: buildReferenceHealth([entry()], [], []),
        inventory: [item()]
      })
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].entry).not.toBeNull()
    expect(rows[0].zoteroItem).not.toBeNull()
  })

  it('marks a cited entry, an uncited entry, a Zotero-only item and a broken citation', () => {
    const citations: CitationUsage[] = [
      { citekey: 'zhang2025laps', count: 3, locations: [] },
      { citekey: 'ghost2024', count: 1, locations: [] }
    ]
    const rows = buildReferenceRows(
      input({
        health: buildReferenceHealth(
          [entry(), entry({ key: 'unused2024', title: 'Unused paper' })],
          citations,
          []
        ),
        inventory: [item({ itemKey: 'ZZZZ9999', citekey: 'deng2025sbd', title: 'Skill Discovery' })]
      })
    )

    expect(rows.map((row) => [row.citekey, row.origin])).toEqual([
      ['zhang2025laps', 'cited'],
      ['unused2024', 'bibliography'],
      ['deng2025sbd', 'zotero'],
      ['ghost2024', 'missing']
    ])
    expect(rows.at(-1)?.broken).toBe(true)
    expect(rows.at(-1)?.citable).toBe(false)
  })

  it('keeps a Zotero item citable only when Better BibTeX resolved a citekey', () => {
    const rows = buildReferenceRows(
      input({
        health: buildReferenceHealth([], [], []),
        inventory: [item({ citekey: null })]
      })
    )

    expect(rows[0].citable).toBe(false)
  })

  it('filters by health state', () => {
    const citations: CitationUsage[] = [{ citekey: 'zhang2025laps', count: 2, locations: [] }]
    const health = buildReferenceHealth(
      [entry(), entry({ key: 'unused2024', title: 'Unused paper' })],
      citations,
      []
    )
    const inventory = [item({ itemKey: 'ZZZZ9999', citekey: 'deng2025sbd', title: 'Skill' })]

    expect(
      buildReferenceRows(input({ health, inventory, filter: 'cited' })).map((row) => row.citekey)
    ).toEqual(['zhang2025laps'])
    expect(
      buildReferenceRows(input({ health, inventory, filter: 'unused' })).map((row) => row.citekey)
    ).toEqual(['unused2024'])
    expect(
      buildReferenceRows(input({ health, inventory, filter: 'zotero' })).map((row) => row.citekey)
    ).toEqual(['deng2025sbd'])
  })

  it('narrows the same single list while a query is typed', () => {
    const rows = buildReferenceRows(
      input({
        health: buildReferenceHealth(
          [entry(), entry({ key: 'other2020', title: 'Other' })],
          [],
          []
        ),
        query: 'latent'
      })
    )

    expect(rows.map((row) => row.citekey)).toEqual(['zhang2025laps'])
  })

  it('does not duplicate a project paper that Zotero search also returns', () => {
    const rows = buildReferenceRows(
      input({
        health: buildReferenceHealth([entry()], [], []),
        searchResults: [
          {
            citekey: 'zhang2025laps',
            title: 'Latent Action Primitive Segmentation',
            author: 'Zhang, Jiajie',
            year: '2025',
            type: 'conferencePaper'
          }
        ],
        query: 'latent'
      })
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].entry).not.toBeNull()
  })

  it('orders by the requested field and keeps natural order untouched', () => {
    const health = buildReferenceHealth(
      [
        entry({ key: 'b2020', title: 'Beta', author: 'Zhang', year: '2020' }),
        entry({ key: 'a2024', title: 'Alpha', author: 'Adams', year: '2024' })
      ],
      [{ citekey: 'b2020', count: 5, locations: [] }],
      []
    )

    expect(buildReferenceRows(input({ health, sort: 'natural' })).map((row) => row.title)).toEqual([
      'Beta',
      'Alpha'
    ])
    expect(buildReferenceRows(input({ health, sort: 'title' })).map((row) => row.title)).toEqual([
      'Alpha',
      'Beta'
    ])
    expect(buildReferenceRows(input({ health, sort: 'author' })).map((row) => row.title)).toEqual([
      'Alpha',
      'Beta'
    ])
    expect(buildReferenceRows(input({ health, sort: 'year' })).map((row) => row.title)).toEqual([
      'Alpha',
      'Beta'
    ])
    expect(
      buildReferenceRows(input({ health, sort: 'citations' })).map((row) => row.title)
    ).toEqual(['Beta', 'Alpha'])
  })
})

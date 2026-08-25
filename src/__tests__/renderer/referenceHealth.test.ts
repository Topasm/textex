import { describe, expect, it } from 'vitest'
import type { BibEntry, ZoteroCollectionItem } from '../../shared/types'
import {
  buildReferenceHealth,
  normalizeArxiv,
  normalizeDoi,
  normalizeTitle
} from '../../renderer/services/referenceHealth'

const projectEntry = (overrides: Partial<BibEntry> = {}): BibEntry => ({
  key: 'projectKey',
  type: 'article',
  title: 'A Vision-Language-Action Model',
  author: 'Black et al.',
  year: '2024',
  ...overrides
})

const zoteroItem = (overrides: Partial<ZoteroCollectionItem> = {}): ZoteroCollectionItem => ({
  itemKey: 'ABCD2345',
  citekey: 'zoteroKey',
  title: 'A Vision Language Action Model',
  author: 'Black et al.',
  year: '2024',
  type: 'journalArticle',
  doi: null,
  arxivId: null,
  ...overrides
})

describe('reference health cross-check', () => {
  it('matches DOI before citekey and reports cited, unused, and broken keys', () => {
    const snapshot = buildReferenceHealth(
      [
        projectEntry({ doi: 'https://doi.org/10.1000/ABC' }),
        projectEntry({ key: 'unused', title: 'Unused paper', year: '2020' })
      ],
      [
        { citekey: 'projectKey', count: 3 },
        { citekey: 'missingKey', count: 1 }
      ],
      [zoteroItem({ doi: '10.1000/abc' })]
    )

    expect(snapshot.project[0]).toMatchObject({ citationCount: 3, matchKind: 'doi' })
    expect(snapshot).toMatchObject({
      citedCount: 1,
      bibliographyCount: 2,
      linkedToZoteroCount: 1,
      projectOnlyCount: 1,
      unusedCount: 1,
      zoteroOnlyCount: 0
    })
    expect(snapshot.missingCitations).toEqual([{ citekey: 'missingKey', count: 1 }])
  })

  it('keeps normalized title matches reviewable instead of auto-linking them', () => {
    const snapshot = buildReferenceHealth(
      [projectEntry()],
      [{ citekey: 'projectKey', count: 1 }],
      [zoteroItem()]
    )

    expect(snapshot.project[0].zoteroItem).toBeNull()
    expect(snapshot.project[0].possibleMatch?.itemKey).toBe('ABCD2345')
    expect(snapshot.projectOnlyCount).toBe(1)
    expect(snapshot.zoteroOnlyCount).toBe(1)
  })

  it('normalizes stable identifiers and presentation-only title differences', () => {
    expect(normalizeDoi(' DOI: https://doi.org/10.1/ABC ')).toBe('10.1/abc')
    expect(normalizeDoi('https://doi.org/10.1/ABC')).toBe('10.1/abc')
    expect(normalizeArxiv('https://arxiv.org/pdf/2401.12345.pdf')).toBe('2401.12345')
    expect(normalizeTitle('{A} Vision-Language \\emph{Action} Model')).toBe(
      'a vision language action model'
    )
  })
})

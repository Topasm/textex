import { describe, expect, it } from 'vitest'
import {
  buildReferenceChatContext,
  mergeReferenceChatContexts
} from '../../renderer/services/referenceChatContext'

describe('reference Chat context model', () => {
  it('rejects persisted descriptors with unsafe citation keys', () => {
    expect(() =>
      buildReferenceChatContext({ source: 'project', citekey: 'bad}\\input{secrets' })
    ).toThrow('invalid citation key')
  })

  it('keeps project metadata display-only and builds a stable citekey descriptor', () => {
    expect(
      buildReferenceChatContext({
        source: 'project',
        citekey: 'Smith_2026:Paper-1',
        metadata: { title: 'A Paper', authors: ['Ada Smith'] }
      })
    ).toEqual({
      id: 'reference:project:citekey:smith_2026%3Apaper-1',
      label: 'A Paper',
      descriptor: { source: 'project', citekey: 'Smith_2026:Paper-1' },
      display: { title: 'A Paper', authors: ['Ada Smith'] }
    })
  })

  it('includes only the Zotero lookup identity in the authoritative descriptor', () => {
    const item = buildReferenceChatContext({
      source: 'zotero',
      citekey: 'Smith2026Paper',
      port: 23_119,
      metadata: { title: 'A Paper', abstract: 'Display preview' }
    })

    expect(item.descriptor).toEqual({
      source: 'zotero',
      citekey: 'Smith2026Paper',
      port: 23_119
    })
    expect(item.display.abstract).toBe('Display preview')
  })

  it('normalizes DOI and arXiv identities for stable online deduplication', () => {
    const doi = buildReferenceChatContext({
      source: 'online',
      reference: {
        source: 'crossref',
        id: 'crossref-record',
        title: 'A Paper',
        authors: [],
        year: '2026',
        type: 'article',
        doi: 'https://doi.org/10.1000/Example'
      }
    })
    const arxiv = buildReferenceChatContext({
      source: 'online',
      reference: {
        source: 'arxiv',
        id: 'arxiv-record',
        title: 'Another Paper',
        authors: [],
        year: '2026',
        type: 'preprint',
        arxivId: 'arXiv:2601.00001v3'
      }
    })

    expect(doi.id).toBe('reference:doi:10.1000%2Fexample')
    expect(arxiv.id).toBe('reference:arxiv:2601.00001')
  })

  it('replaces duplicates in place and refuses contexts beyond the limit', () => {
    const first = buildReferenceChatContext({ source: 'project', citekey: 'paper' })
    const replacement = buildReferenceChatContext({
      source: 'project',
      citekey: 'PAPER',
      metadata: { title: 'Resolved title' }
    })
    const other = buildReferenceChatContext({ source: 'zotero', citekey: 'other' })

    expect(mergeReferenceChatContexts([first, other], replacement, 2)).toEqual([replacement, other])
    expect(
      mergeReferenceChatContexts(
        [first, other],
        buildReferenceChatContext({ source: 'project', citekey: 'third' }),
        2
      )
    ).toEqual([first, other])
  })

  it('bounds stable IDs for unusually long external identifiers', () => {
    const item = buildReferenceChatContext({
      source: 'online',
      reference: {
        source: 'crossref',
        id: 'record',
        title: 'A Paper',
        authors: [],
        year: '2026',
        type: 'article',
        doi: `10.1000/${'long-identifier'.repeat(30)}`
      }
    })

    expect(item.id).toMatch(/^reference:doi:hash:[a-f0-9]{16}$/u)
    expect(item.id.length).toBeLessThanOrEqual(128)
  })
})

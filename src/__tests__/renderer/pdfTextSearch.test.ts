import { describe, expect, it } from 'vitest'
import { buildPdfPageText, findPdfTextMatches } from '../../renderer/services/pdfTextSearch'

describe('PDF text search', () => {
  it('counts separate occurrences inside a single text item', () => {
    const page = buildPdfPageText([{ str: 'Target and TARGET' }])
    expect(findPdfTextMatches(page, 'target', 7)).toEqual([
      { page: 7, segments: [{ span: 0, start: 0, end: 6, text: 'Target and TARGET' }] },
      { page: 7, segments: [{ span: 0, start: 11, end: 17, text: 'Target and TARGET' }] }
    ])
  })
  it('finds phrases split across text items and line breaks', () => {
    const page = buildPdfPageText([
      { str: 'The ef' },
      { str: 'ficient', hasEOL: true },
      { str: '', hasEOL: true },
      { str: 'method works' }
    ])
    const [match] = findPdfTextMatches(page, 'efficient method', 2)
    expect(
      match.segments.map(({ span, start, end, text }) => [span, text.slice(start, end)])
    ).toEqual([
      [0, 'ef'],
      [1, 'ficient'],
      [2, 'method']
    ])
  })
  it('preserves source offsets for ligatures, accents and astral characters', () => {
    const page = buildPdfPageText([{ str: '😀 eﬃcient cafe\u0301' }])
    expect(findPdfTextMatches(page, 'efficient', 1)[0].segments[0]).toMatchObject({
      start: 3,
      end: 10
    })
    expect(findPdfTextMatches(page, 'café', 1)[0].segments[0]).toMatchObject({ start: 11, end: 16 })
    expect(findPdfTextMatches(page, '😀', 1)[0].segments[0]).toMatchObject({ start: 0, end: 2 })
  })
  it('treats punctuation literally and ignores empty queries', () => {
    const page = buildPdfPageText([{ str: 'a.b axb' }])
    expect(findPdfTextMatches(page, 'a.b', 1)).toHaveLength(1)
    expect(findPdfTextMatches(page, ' \n ', 1)).toEqual([])
  })
})

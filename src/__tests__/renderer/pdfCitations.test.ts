import { describe, expect, it } from 'vitest'
import { parseAuxContent } from '../../shared/auxparser'
import {
  citationKeyFromDestination,
  resolvePdfCitation,
  resolvePdfCitationLabel
} from '../../renderer/services/pdfCitations'

const first = {
  key: 'method:2026',
  title: 'First paper',
  author: 'Kim',
  year: '2026',
  type: 'article'
}
const second = { ...first, key: 'other', title: 'Second paper' }
const entries = [first, second]
const labels = parseAuxContent('\\bibcite{method:2026}{1}\n\\bibcite{other}{2}')

describe('PDF citation destinations', () => {
  it.each(['cite.method:2026', '#cite.method%3A2026', 'cite.0@method:2026'])(
    'resolves %s to the project bibliography',
    (destination) => {
      expect(resolvePdfCitation(destination, entries)).toEqual([first])
    }
  )

  it.each(['#section.1', 'https://example.org/#cite.other', [1, 'Fit'], null])(
    'leaves non-citation destinations alone: %s',
    (destination) => {
      expect(citationKeyFromDestination(destination)).toBeNull()
    }
  )

  it('keeps unknown citation keys explicit without fabricating bibliography details', () => {
    expect(resolvePdfCitation('cite.unknown', entries)).toEqual([
      { key: 'unknown', title: '', author: '', year: '', type: '' }
    ])
  })

  it('resolves grouped and ranged numeric labels in citation order without duplicates', () => {
    expect(resolvePdfCitationLabel('[2, 1–2]', entries, labels)).toEqual([second, first])
  })

  it.each([
    '[1-2-3]',
    '[2-1]',
    '[1-999999999]',
    '[99999999999999999999]',
    'Text [1]',
    '(1)',
    '[3]'
  ])('does not turn unrelated or invalid text into a citation: %s', (text) => {
    expect(resolvePdfCitationLabel(text, entries, labels)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import {
  sentenceAt,
  sourceSentenceAt,
  sentenceSearchText
} from '../../renderer/utils/sentenceSelection'
import { previewSourceRange } from '../../renderer/utils/previewSelection'
import { selectPdfSentence } from '../../renderer/services/pdfSentenceSelection'

it('selects a complete wrapped sentence and retains source columns', () => {
  const source =
    '\\begin{document}\nFirst sentence. The efficient\nmethod works. Last sentence.\n\\end{document}'
  expect(sourceSentenceAt(source, { line: 3, column: 3 })).toEqual({
    text: 'The efficient\nmethod works.',
    range: { start: { line: 2, column: 17 }, end: { line: 3, column: 14 } }
  })
})

it('handles Korean, decimals, end positions and paragraph boundaries', () => {
  const text = '첫 문장입니다. 값은 3.14입니다. 마지막입니다.'
  const range = sentenceAt(text, text.indexOf('3.14'))!
  expect(text.slice(range.start, range.end)).toBe('값은 3.14입니다.')
  expect(
    sourceSentenceAt('Earlier paragraph\n\nCurrent paragraph', { line: 3, column: 3 })?.text
  ).toBe('Current paragraph')
  expect(sourceSentenceAt('% Comment\nText', { line: 1, column: 3 })).toBeNull()
  expect(sourceSentenceAt('Text', { line: 9, column: 1 })).toBeNull()
  expect(sentenceAt('', 0)).toBeNull()
  expect(sentenceAt('One.', 4)).toEqual({ start: 0, end: 4 })
})

it('matches transparent TeX formatting without selecting adjacent sentences', () => {
  const source = 'First sentence. The \\textbf{efficient} method works. Last sentence.'
  expect(previewSourceRange(source, 'The efficient\nmethod works.', 1, 1)).toEqual({
    start: { line: 1, column: 17 },
    end: { line: 1, column: 53 }
  })
  expect(sentenceSearchText('The \\textbf{efficient} method~works.')).toBe(
    'The efficient method works.'
  )
  expect(sentenceSearchText('Read \\cite{paper}.')).toContain('\\cite')
})

describe('PDF sentence expansion', () => {
  it('expands the clicked word across rendered line breaks without changing PDF nodes', () => {
    const page = document.createElement('div')
    page.innerHTML =
      '<div class="textLayer"><span role="presentation">First sentence. The efficient</span><br><span role="presentation">method works. Last sentence.</span></div>'
    document.body.append(page)
    try {
      const spans = page.querySelectorAll('span')
      const range = document.createRange()
      range.setStart(spans[1].firstChild!, 0)
      range.setEnd(spans[1].firstChild!, 6)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
      expect(selectPdfSentence(page, spans[1])).toBe(true)
      const selected = selection.getRangeAt(0)
      expect(selected.startContainer).toBe(spans[0].firstChild)
      expect(selected.startOffset).toBe(16)
      expect(selected.endContainer).toBe(spans[1].firstChild)
      expect(selected.endOffset).toBe(13)
      expect(page.querySelectorAll('span')).toHaveLength(2)
    } finally {
      window.getSelection()?.removeAllRanges()
      page.remove()
    }
  })
})

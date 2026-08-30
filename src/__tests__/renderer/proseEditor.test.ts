import { describe, expect, it } from 'vitest'
import {
  editMarkdownSelection,
  isMarkdownSelectionFormatted,
  proseDocumentStats,
  textareaVisibleLine
} from '../../renderer/utils/proseEditor'

describe('prose editor formatting', () => {
  it('wraps a selection and keeps the selected text selected', () => {
    expect(editMarkdownSelection('write clearly', 6, 13, 'strong')).toEqual({
      text: 'write **clearly**',
      selectionStart: 8,
      selectionEnd: 15
    })
  })

  it('toggles an existing inline format off', () => {
    const text = 'write *clearly*'
    expect(isMarkdownSelectionFormatted(text, 7, 14, 'emphasis')).toBe(true)
    expect(editMarkdownSelection(text, 7, 14, 'emphasis')).toEqual({
      text: 'write clearly',
      selectionStart: 6,
      selectionEnd: 13
    })
  })

  it('places an empty caret between new fences', () => {
    expect(editMarkdownSelection('result', 6, 6, 'code')).toEqual({
      text: 'result``',
      selectionStart: 7,
      selectionEnd: 7
    })
  })

  it('combines bold and italic without accidentally replacing either style', () => {
    const italicized = editMarkdownSelection('write **clearly**', 8, 15, 'emphasis')
    expect(italicized.text).toBe('write ***clearly***')
    expect(isMarkdownSelectionFormatted(italicized.text, 9, 16, 'strong')).toBe(true)
    expect(isMarkdownSelectionFormatted(italicized.text, 9, 16, 'emphasis')).toBe(true)

    expect(editMarkdownSelection(italicized.text, 9, 16, 'emphasis').text).toBe('write **clearly**')
  })
})

describe('prose editor statistics and scroll mapping', () => {
  it('reports writing-focused word and line counts', () => {
    expect(proseDocumentStats('A short line.\n\nAnd another.')).toEqual({ words: 5, lines: 3 })
    expect(proseDocumentStats('')).toEqual({ words: 0, lines: 0 })
  })

  it('maps textarea scroll to a bounded visible line', () => {
    const area = document.createElement('textarea')
    area.value = ['one', 'two', 'three', 'four'].join('\n')
    area.style.fontSize = '10px'
    area.style.lineHeight = '2'
    area.scrollTop = 42
    expect(textareaVisibleLine(area)).toBe(3)
  })
})

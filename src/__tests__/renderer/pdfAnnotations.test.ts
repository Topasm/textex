import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  annotationNotes,
  MAX_ANNOTATION_PDF_BYTES,
  readPdfAnnotations
} from '../../renderer/services/pdfAnnotations'

const mocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  getPage: vi.fn(),
  destroy: vi.fn(),
  cleanup: vi.fn(),
  annotations: vi.fn(),
  text: vi.fn()
}))
vi.mock('react-pdf', () => ({ pdfjs: { getDocument: mocks.getDocument, GlobalWorkerOptions: {} } }))

const file = (name = 'review.pdf', size = 50) =>
  ({ name, size, arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(50)) }) as unknown as File
const read = (input = file()) => readPdfAnnotations(input, new AbortController().signal)
const textRun = (str: string, y: number) => ({
  str,
  transform: [10, 0, 0, 10, 10, y],
  width: 100,
  height: 10,
  hasEOL: true
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.destroy.mockResolvedValue(undefined)
  mocks.annotations.mockResolvedValue([])
  mocks.text.mockResolvedValue({
    items: [textRun('Marked sentence', 20), textRun('Other line', 40)]
  })
  mocks.getPage.mockResolvedValue({
    getAnnotations: mocks.annotations,
    getTextContent: mocks.text,
    cleanup: mocks.cleanup
  })
  mocks.getDocument.mockReturnValue({
    promise: Promise.resolve({ numPages: 2, getPage: mocks.getPage }),
    destroy: mocks.destroy
  })
})

describe('PDF annotation import', () => {
  it('reads comments and markup across pages, ignoring links, forms and popup duplicates', async () => {
    mocks.annotations
      .mockResolvedValueOnce([
        {
          subtype: 'Text',
          titleObj: { str: 'Reviewer' },
          contentsObj: { str: 'Please revise.\r\nThanks.' }
        },
        { subtype: 'Popup', contentsObj: { str: 'Please revise.' } },
        { subtype: 'Link', contentsObj: { str: 'Link' } },
        { subtype: 'Widget', contentsObj: { str: 'Form' } },
        { subtype: 'Ink' }
      ])
      .mockResolvedValueOnce([
        {
          subtype: 'Highlight',
          quadPoints: new Float32Array([10, 30, 110, 30, 10, 20, 110, 20]),
          contentsObj: { str: 'Explain this' }
        },
        { subtype: 'Underline', rect: [10, 20, 110, 30] }
      ])
    const result = await read()
    expect(result).toEqual([
      {
        page: 1,
        kind: 'Text',
        author: 'Reviewer',
        comment: 'Please revise.\nThanks.',
        markedText: ''
      },
      {
        page: 2,
        kind: 'Highlight',
        author: '',
        comment: 'Explain this',
        markedText: 'Marked sentence'
      },
      { page: 2, kind: 'Underline', author: '', comment: '', markedText: 'Marked sentence' }
    ])
    expect(mocks.text).toHaveBeenCalledOnce()
    expect(mocks.cleanup).toHaveBeenCalledTimes(2)
    expect(mocks.destroy).toHaveBeenCalledOnce()
  })

  it('keeps page-only highlights on image-only PDFs and supports legacy comment fields', async () => {
    mocks.text.mockResolvedValue({ items: [] })
    mocks.annotations.mockResolvedValueOnce([
      { subtype: 'Highlight', rect: [0, 0, 10, 10] },
      { subtype: 'FreeText', title: 'Author', contents: 'A note' }
    ])
    expect(await read()).toMatchObject([
      { kind: 'Highlight', page: 1, markedText: '' },
      { kind: 'FreeText', author: 'Author', comment: 'A note' }
    ])
  })

  it('returns no notes for unannotated PDFs', async () => {
    expect(await read()).toEqual([])
    expect(mocks.text).not.toHaveBeenCalled()
  })

  it('rejects oversized, empty and non-PDF files before reading bytes', async () => {
    for (const input of [
      file('a.pdf', MAX_ANNOTATION_PDF_BYTES + 1),
      file('a.pdf', 0),
      file('a.txt')
    ]) {
      await expect(read(input)).rejects.toThrow(/Choose a PDF/)
      expect(input.arrayBuffer).not.toHaveBeenCalled()
    }
    expect(mocks.getDocument).not.toHaveBeenCalled()
  })

  it('cleans up corrupt and password-protected documents on failure', async () => {
    mocks.getDocument.mockReturnValue({
      promise: Promise.reject(new Error('Password required')),
      destroy: mocks.destroy
    })
    await expect(read()).rejects.toThrow('Password required')
    expect(mocks.destroy).toHaveBeenCalledOnce()
  })

  it('releases page and document resources when extracting fails', async () => {
    mocks.annotations.mockRejectedValue(new Error('Broken annotation'))
    await expect(read()).rejects.toThrow('Broken annotation')
    expect(mocks.cleanup).toHaveBeenCalledOnce()
    expect(mocks.destroy).toHaveBeenCalledOnce()
  })

  it('does not accept results after cancellation', async () => {
    const controller = new AbortController()
    mocks.annotations.mockImplementation(async () => {
      controller.abort()
      return [{ subtype: 'Text', contents: 'Stale' }]
    })
    await expect(readPdfAnnotations(file(), controller.signal)).rejects.toThrow()
    expect(mocks.getPage).toHaveBeenCalledTimes(1)
    expect(mocks.destroy).toHaveBeenCalled()
  })

  it('formats review checkboxes with page, author, context and multiline comments', () => {
    const lines = annotationNotes('review.pdf', [
      {
        page: 3,
        kind: 'Highlight',
        author: 'Reviewer',
        comment: 'Fix this\nAnd this',
        markedText: 'Some context'
      }
    ])
    expect(lines.join('\n')).toContain('- [ ] Page 3 · Highlight · Reviewer')
    expect(lines.join('\n')).toContain(
      '> Marked text context (approximate):\n> Some context\n> Fix this\n> And this'
    )
    expect(
      annotationNotes('a\n# title.pdf', [
        {
          page: 1,
          kind: 'Text',
          author: '',
          markedText: '',
          comment: '# Title\n[x](https://example.com)'
        }
      ]).join('\n')
    ).toContain('> \\# Title\n> \\[x\\](https://example.com)')
  })
})

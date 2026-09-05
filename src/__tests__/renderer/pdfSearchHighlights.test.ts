import { afterEach, describe, expect, it, vi } from 'vitest'
import { paintPdfSearchHighlights } from '../../renderer/services/pdfSearchHighlights'
import type { PdfSearchMatch } from '../../renderer/services/pdfTextSearch'

const match = (page: number): PdfSearchMatch => ({
  page,
  segments: [{ span: 0, start: 0, end: 6, text: 'target' }]
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

function fixture() {
  document.body.innerHTML = `<div id="viewer"><div data-pdf-generation="1"><div data-page-number="1"><div class="textLayer"><span role="presentation">target</span></div></div></div><div data-pdf-generation="2"><div data-page-number="1"><div class="textLayer"><span role="presentation">target</span></div></div></div></div>`
  const container = document.getElementById('viewer')!
  const page = container.querySelector<HTMLElement>('[data-pdf-generation="1"] [data-page-number]')!
  Object.defineProperty(page, 'clientWidth', { value: 100 })
  const bounds = vi.spyOn(page, 'getBoundingClientRect').mockReturnValue({
    left: 10,
    top: 20,
    width: 200,
    height: 300
  } as DOMRect)
  const rects = vi.fn(() => {
    // New overlays must stay detached until every geometry read finishes.
    expect(container.querySelector('[data-pdf-search-overlay]')).toBeNull()
    return [{ left: 30, top: 40, width: 60, height: 20 }] as unknown as DOMRectList
  })
  const createRange = document.createRange.bind(document)
  vi.spyOn(document, 'createRange').mockImplementation(() => {
    const range = createRange()
    range.getClientRects = rects
    return range
  })
  return { container, page, bounds, rects }
}

describe('PDF search highlight rendering', () => {
  it('bounds DOM queries and layout reads to rendered pages for thousands of results', () => {
    const { container, page, bounds, rects } = fixture()
    const query = vi.spyOn(Element.prototype, 'querySelector')
    const matches = [match(1), ...Array.from({ length: 10_000 }, () => match(24)), match(1)]
    const active = paintPdfSearchHighlights(container, 1, matches, matches.length - 1)
    expect(
      query.mock.calls.filter(([selector]) => selector.includes('data-page-number'))
    ).toHaveLength(0)
    expect(bounds).toHaveBeenCalledTimes(1)
    expect(rects).toHaveBeenCalledTimes(2)
    expect(page.querySelectorAll('.pdf-search-highlight')).toHaveLength(2)
    expect(active?.dataset.pdfSearchMatch).toBe('10001')
    expect(active?.style.left).toBe('10px')
    expect(active?.style.top).toBe('10px')
    expect(active?.style.width).toBe('30px')
    expect(active?.style.height).toBe('10px')
    expect(
      container.querySelector('[data-pdf-generation="2"] [data-pdf-search-overlay]')
    ).toBeNull()
  })

  it('preserves selected text nodes and removes stale highlights on repaint', () => {
    const { container, page } = fixture()
    const text = page.querySelector('span')!.firstChild!
    const selection = window.getSelection()!
    const range = document.createRange()
    range.selectNodeContents(text)
    selection.removeAllRanges()
    selection.addRange(range)
    paintPdfSearchHighlights(container, 1, [match(1)], 0)
    expect(selection.toString()).toBe('target')
    expect(page.querySelector('span')!.firstChild).toBe(text)
    paintPdfSearchHighlights(container, 1, [], 0)
    expect(container.querySelectorAll('[data-pdf-search-overlay]')).toHaveLength(0)
    expect(selection.toString()).toBe('target')
  })
})

import type { PdfSearchMatch } from './pdfTextSearch'

export function clearPdfSearchHighlights(container: HTMLElement): void {
  container.querySelectorAll('[data-pdf-search-overlay]').forEach((overlay) => overlay.remove())
}

/** Draw ranges above the text layer, preserving its text nodes and drag selection. */
export function paintPdfSearchHighlights(
  container: HTMLElement,
  revision: number,
  matches: readonly PdfSearchMatch[],
  activeIndex: number
): HTMLElement | null {
  clearPdfSearchHighlights(container)
  const generation = container.querySelector(`[data-pdf-generation="${revision}"]`)
  if (!generation) return null

  // Index rendered pages once; off-screen matches never trigger DOM queries.
  const pages = new Map<
    number,
    { element: HTMLElement; matches: Array<{ match: PdfSearchMatch; index: number }> }
  >()
  generation.querySelectorAll<HTMLElement>('[data-page-number]').forEach((element) => {
    pages.set(Number(element.dataset.pageNumber), { element, matches: [] })
  })
  matches.forEach((match, index) => pages.get(match.page)?.matches.push({ match, index }))

  let current: HTMLElement | null = null
  const overlays: Array<{ element: HTMLElement; overlay: HTMLElement }> = []
  for (const page of pages.values()) {
    if (!page.matches.length) continue
    const textLayer = page.element.querySelector('.textLayer')
    if (!textLayer) continue
    const spans = [...textLayer.querySelectorAll<HTMLElement>('span[role="presentation"]')].filter(
      (span) => !span.children.length && span.textContent
    )
    const bounds = page.element.getBoundingClientRect()
    const scale = bounds.width / page.element.clientWidth
    if (!Number.isFinite(scale) || scale <= 0) continue
    const overlay = document.createElement('div')
    overlay.dataset.pdfSearchOverlay = ''
    overlay.setAttribute('aria-hidden', 'true')
    Object.assign(overlay.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      zIndex: '2'
    })
    for (const { match, index } of page.matches) {
      for (const segment of match.segments) {
        const span = spans[segment.span]
        if (!span || span.textContent !== segment.text || !span.firstChild) continue
        const range = document.createRange()
        range.setStart(span.firstChild, segment.start)
        range.setEnd(span.firstChild, segment.end)
        for (const rect of range.getClientRects()) {
          if (rect.width <= 0 || rect.height <= 0) continue
          const highlight = document.createElement('div')
          highlight.className = `pdf-search-highlight${index === activeIndex ? ' pdf-search-current' : ''}`
          highlight.dataset.pdfSearchMatch = String(index)
          Object.assign(highlight.style, {
            position: 'absolute',
            left: `${(rect.left - bounds.left) / scale}px`,
            top: `${(rect.top - bounds.top) / scale}px`,
            width: `${rect.width / scale}px`,
            height: `${rect.height / scale}px`
          })
          overlay.append(highlight)
          if (index === activeIndex && !current) current = highlight
        }
      }
    }
    overlays.push({ element: page.element, overlay })
  }
  // Finish geometry reads before changing the live DOM, avoiding repeated layout.
  for (const { element, overlay } of overlays) element.append(overlay)
  return current
}

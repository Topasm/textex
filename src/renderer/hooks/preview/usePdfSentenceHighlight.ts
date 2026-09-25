import { useEffect, type RefObject } from 'react'
import { usePdfStore } from '../../store/usePdfStore'
import { renderedPdfText } from '../../services/pdfSentenceSelection'
import { findPdfTextMatches } from '../../services/pdfTextSearch'
import {
  clearPdfSearchHighlights,
  paintPdfSearchHighlights
} from '../../services/pdfSearchHighlights'
import { sentenceSearchText } from '../../utils/sentenceSelection'

/** Refine the native line location using the clicked source sentence on the rendered page. */
export function usePdfSentenceHighlight(
  containerRef: RefObject<HTMLDivElement | null>,
  pagesRef: RefObject<Map<number, { pageWidth: number }>>,
  revision: number
) {
  const target = usePdfStore((state) => state.synctexHighlight)
  useEffect(() => {
    const container = containerRef.current
    if (!container || !target?.sentence || target.pdfRevision !== revision) return
    let frame: number | null = null
    let needsScroll = true
    const paint = () => {
      frame = null
      const page = container.querySelector<HTMLElement>(
        `[data-pdf-generation="${revision}"] [data-page-number="${target.page}"]`
      )
      if (!page) return
      const content = renderedPdfText(page)
      const matches = findPdfTextMatches(content, sentenceSearchText(target.sentence!), target.page)
      // Repeated sentences are resolved by proximity to the native SyncTeX line.
      const bounds = page.getBoundingClientRect()
      const info = pagesRef.current.get(target.page)
      if (!info) return
      const scale = bounds.width / info.pageWidth
      const nearest = matches
        .map((match, index) => {
          const rect = content.elements[match.segments[0].span]?.getBoundingClientRect()
          return {
            index,
            distance: rect ? Math.abs(rect.top - bounds.top - target.y * scale) : Infinity
          }
        })
        .sort((a, b) => a.distance - b.distance)[0]?.index
      const active =
        nearest === undefined
          ? null
          : paintPdfSearchHighlights(container, revision, [matches[nearest]], 0, 'synctex')
      if (active && needsScroll) {
        active.scrollIntoView({ block: 'center' })
        needsScroll = false
      }
    }
    paint()
    const observer = new MutationObserver((records) => {
      if (
        records.some(
          (record) =>
            (record.target instanceof Element && record.target.closest('.textLayer')) ||
            [...record.addedNodes, ...record.removedNodes].some(
              (node) =>
                node instanceof Element &&
                (node.matches('.textLayer, [data-pdf-generation]') ||
                  node.querySelector('.textLayer'))
            )
        ) &&
        frame === null
      )
        frame = requestAnimationFrame(paint)
    })
    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style']
    })
    return () => {
      observer.disconnect()
      if (frame !== null) cancelAnimationFrame(frame)
      clearPdfSearchHighlights(container, 'synctex')
    }
  }, [containerRef, pagesRef, revision, target])
}

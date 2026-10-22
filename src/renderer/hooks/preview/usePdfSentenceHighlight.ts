import { useEffect, type RefObject } from 'react'
import { usePdfStore } from '../../store/usePdfStore'
import { renderedPdfText } from '../../services/pdfSentenceSelection'
import { findPdfTextMatches } from '../../services/pdfTextSearch'
import {
  clearPdfSearchHighlights,
  observeTextLayerRepaint,
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
    const paint = () => {
      const page = container.querySelector<HTMLElement>(
        `[data-pdf-generation="${revision}"] [data-page-number="${target.page}"]`
      )
      if (!page) return null
      const content = renderedPdfText(page)
      const matches = findPdfTextMatches(content, sentenceSearchText(target.sentence!), target.page)
      // Repeated sentences are resolved by proximity to the native SyncTeX line.
      const bounds = page.getBoundingClientRect()
      const info = pagesRef.current.get(target.page)
      if (!info) return null
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
      return nearest === undefined
        ? null
        : paintPdfSearchHighlights(container, revision, [matches[nearest]], 0, 'synctex')
    }
    const stop = observeTextLayerRepaint(container, paint)
    return () => {
      stop()
      clearPdfSearchHighlights(container, 'synctex')
    }
  }, [containerRef, pagesRef, revision, target])
}

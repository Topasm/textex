import { useState, useEffect, useCallback, useRef } from 'react'
import { useProjectStore } from '../../store/useProjectStore'
import type { BibEntry } from '../../../shared/types'
import type { AuxCitationMap } from '../../../shared/auxparser'

export interface CitationTooltipData {
  entries: BibEntry[]
  x: number
  y: number
  containerRect: DOMRect
}

/**
 * Detects hover over citation references in the PDF preview and resolves
 * them to BibEntry data for tooltip display.
 *
 * Primary: annotation layer links (hyperref) with href containing cite keys.
 * Fallback: text layer spans matching [N] patterns, resolved via auxCitationMap.
 */
export function useCitationTooltip(
  containerRef: React.RefObject<HTMLDivElement | null>,
  pdfRevision: number
): { tooltipData: CitationTooltipData | null } {
  const [tooltipData, setTooltipData] = useState<CitationTooltipData | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeTargetRef = useRef<EventTarget | null>(null)

  const resolveFromAnnotationLink = useCallback((anchor: HTMLAnchorElement): BibEntry[] | null => {
    const href = anchor.getAttribute('href') || ''
    // hyperref internal links use fragment identifiers like #cite.KEY or destinations
    // Also check data-dest attribute used by some PDF renderers
    const dest = anchor.getAttribute('data-dest') || ''
    const combined = href + ' ' + dest

    // Match cite.KEY pattern (hyperref default)
    const citeMatch = combined.match(/cite\.([^\s#&]+)/)
    if (!citeMatch) return null

    const citeKey = citeMatch[1]
    const bibEntries = useProjectStore.getState().bibEntries
    const entry = bibEntries.find((e) => e.key === citeKey)
    return entry ? [entry] : null
  }, [])

  const resolveFromTextSpan = useCallback((span: HTMLSpanElement): BibEntry[] | null => {
    const text = span.textContent?.trim()
    if (!text) return null

    // Match citation patterns: [1], [2,3], [1, 2, 3]
    const match = text.match(/^\[(\d+(?:\s*,\s*\d+)*)\]$/)
    if (!match) return null

    const auxCitationMap = useProjectStore.getState().auxCitationMap as AuxCitationMap | null
    if (!auxCitationMap) return null

    const bibEntries = useProjectStore.getState().bibEntries
    const numbers = match[1].split(',').map((s) => s.trim())
    const results: BibEntry[] = []

    for (const num of numbers) {
      const keys = auxCitationMap.labelToKeys.get(num)
      if (keys) {
        for (const key of keys) {
          const entry = bibEntries.find((e) => e.key === key)
          if (entry) results.push(entry)
        }
      }
    }

    return results.length > 0 ? results : null
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target) return

      // Check annotation layer links first
      const anchor = target.closest('.annotationLayer a') as HTMLAnchorElement | null
      if (anchor) {
        activeTargetRef.current = anchor
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
          if (activeTargetRef.current !== anchor) return
          const entries = resolveFromAnnotationLink(anchor)
          if (entries && entries.length > 0) {
            const rect = anchor.getBoundingClientRect()
            const containerRect = container.getBoundingClientRect()
            setTooltipData({
              entries,
              x: rect.left - containerRect.left + container.scrollLeft,
              y: rect.top - containerRect.top + container.scrollTop,
              containerRect
            })
          }
        }, 150)
        return
      }

      // Fallback: text layer spans
      const span = target.closest('.react-pdf__Page__textContent span') as HTMLSpanElement | null
      if (span) {
        activeTargetRef.current = span
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
          if (activeTargetRef.current !== span) return
          const entries = resolveFromTextSpan(span)
          if (entries && entries.length > 0) {
            const rect = span.getBoundingClientRect()
            const containerRect = container.getBoundingClientRect()
            setTooltipData({
              entries,
              x: rect.left - containerRect.left + container.scrollLeft,
              y: rect.top - containerRect.top + container.scrollTop,
              containerRect
            })
          }
        }, 150)
        return
      }
    }

    const handleMouseOut = (e: MouseEvent) => {
      const related = e.relatedTarget as HTMLElement | null
      // If moving to another citation element, let mouseover handle it
      if (
        related?.closest?.('.annotationLayer a') ||
        related?.closest?.('.react-pdf__Page__textContent span')
      ) {
        return
      }
      activeTargetRef.current = null
      if (debounceRef.current) clearTimeout(debounceRef.current)
      setTooltipData(null)
    }

    container.addEventListener('mouseover', handleMouseOver)
    container.addEventListener('mouseout', handleMouseOut)

    return () => {
      container.removeEventListener('mouseover', handleMouseOver)
      container.removeEventListener('mouseout', handleMouseOut)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [containerRef, resolveFromAnnotationLink, resolveFromTextSpan])

  // Clear tooltip when PDF recompiles
  useEffect(() => {
    setTooltipData(null)
    activeTargetRef.current = null
  }, [pdfRevision])

  return { tooltipData }
}

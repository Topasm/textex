import { useCallback, useEffect, useRef, useState } from 'react'
import type React from 'react'
import { usePdfStore } from '../../store/usePdfStore'
import { useHorizontalSwipe, wheelDeltaScale } from '../useHorizontalSwipe'
import { SWIPE_COOLDOWN_MS, SWIPE_THRESHOLD } from '../../components/previewUtils'

export type PreviewSlideDirection = 'left' | 'right' | null

interface PreviewPageSwipeOptions {
  containerRef: React.RefObject<HTMLDivElement | null>
  pdfViewMode: 'single' | 'continuous'
}

interface PreviewPageSwipe {
  /** Slide animation class suffix for the single-page container. */
  slideDirection: PreviewSlideDirection
  clearSlideDirection: () => void
  /** Turn one page with the slide animation; false when already at an edge. */
  stepPage: (direction: 1 | -1) => boolean
}

/**
 * Wheel navigation for the PDF preview.
 *
 * A horizontal flick goes through the shared gesture layer, so one flick turns
 * exactly one page and feels the same as swiping between panel tabs. Vertical
 * wheel travel stays preview-specific: in single-page mode there is nothing to
 * scroll, so accumulated vertical delta turns the page instead, and continuous
 * mode keeps horizontal wheel and Shift+wheel as plain sideways scrolling.
 */
export function usePreviewPageSwipe({
  containerRef,
  pdfViewMode
}: PreviewPageSwipeOptions): PreviewPageSwipe {
  const [slideDirection, setSlideDirection] = useState<PreviewSlideDirection>(null)
  const verticalAccumRef = useRef(0)
  const verticalCooldownRef = useRef(false)
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const clearSlideDirection = useCallback(() => setSlideDirection(null), [])

  const stepPage = useCallback((direction: 1 | -1): boolean => {
    const { currentPage, numPages } = usePdfStore.getState()
    const next = currentPage + direction
    if (next < 1 || next > numPages) return false
    setSlideDirection(direction > 0 ? 'left' : 'right')
    usePdfStore.getState().setCurrentPage(next)
    return true
  }, [])

  const handleHorizontalSwipe = useHorizontalSwipe(
    useCallback((direction: 1 | -1) => stepPage(direction), [stepPage])
  )

  useEffect(() => {
    return () => clearTimeout(cooldownTimerRef.current)
  }, [])

  // Reset the vertical accumulator when the mode changes so a half-finished
  // scroll cannot turn a page after switching views.
  useEffect(() => {
    verticalAccumRef.current = 0
  }, [pdfViewMode])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handler = (e: WheelEvent): void => {
      // Ctrl/Cmd + wheel belongs to usePreviewZoom.
      if (e.ctrlKey || e.metaKey) return

      if (pdfViewMode === 'single') {
        if (e.deltaX === 0 && e.deltaY === 0) return
        e.preventDefault()

        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
          // The preview needs a non-passive listener to preventDefault, so the
          // native event goes straight to the hook's widened signature.
          verticalAccumRef.current = 0
          handleHorizontalSwipe(e)
          return
        }

        if (verticalCooldownRef.current) return
        verticalAccumRef.current += e.deltaY
        if (Math.abs(verticalAccumRef.current) < SWIPE_THRESHOLD) return

        stepPage(verticalAccumRef.current > 0 ? 1 : -1)
        verticalAccumRef.current = 0
        verticalCooldownRef.current = true
        clearTimeout(cooldownTimerRef.current)
        cooldownTimerRef.current = setTimeout(() => {
          verticalCooldownRef.current = false
        }, SWIPE_COOLDOWN_MS)
        return
      }

      // A line- or page-mode wheel reports notches, so scroll by their pixels.
      const scale = wheelDeltaScale(e.deltaMode)

      // Continuous mode: Shift + vertical wheel → horizontal scroll
      if (e.shiftKey && e.deltaY !== 0) {
        el.scrollLeft += e.deltaY * scale
        e.preventDefault()
        return
      }

      // Horizontal wheel (e.g. MX Master thumb wheel)
      if (e.deltaX !== 0) {
        el.scrollLeft += e.deltaX * scale
        if (e.deltaY === 0) e.preventDefault()
      }
    }

    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [containerRef, handleHorizontalSwipe, pdfViewMode, stepPage])

  return { slideDirection, clearSlideDirection, stepPage }
}

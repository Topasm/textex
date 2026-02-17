import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { ZOOM_MIN, ZOOM_MAX, DEBOUNCE_ZOOM_MS } from '../../constants'

export interface PreviewZoomState {
  transientScale: number | null
}

/**
 * Manages Ctrl+scroll zoom with instant CSS transform feedback
 * and debounced react-pdf re-render.
 */
export function usePreviewZoom(
  containerRef: React.RefObject<HTMLDivElement | null>
): PreviewZoomState {
  const [transientScale, setTransientScale] = useState<number | null>(null)
  const transientTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingZoomRef = useRef<number | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()

      const s = useAppStore.getState()
      const rawStep = Math.abs(e.deltaY) * 0.15
      const step = Math.max(1, Math.min(rawStep, 5))
      const baseZoom = pendingZoomRef.current ?? s.zoomLevel
      const newZoom =
        e.deltaY < 0 ? Math.min(ZOOM_MAX, baseZoom + step) : Math.max(ZOOM_MIN, baseZoom - step)
      pendingZoomRef.current = newZoom

      // Instant visual feedback via CSS transform
      setTransientScale(newZoom / s.zoomLevel)

      // Debounce the actual re-render
      if (transientTimerRef.current) clearTimeout(transientTimerRef.current)
      transientTimerRef.current = setTimeout(() => {
        const finalZoom = pendingZoomRef.current ?? newZoom
        pendingZoomRef.current = null
        useAppStore.getState().setZoomLevel(finalZoom)
        setTransientScale(null)
      }, DEBOUNCE_ZOOM_MS)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [containerRef])

  return { transientScale }
}

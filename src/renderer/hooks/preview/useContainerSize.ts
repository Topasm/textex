import { useState, useEffect, useRef } from 'react'
import { PREVIEW_RESIZE_SETTLE_MS } from '../../constants'

export interface ContainerSizeState {
  containerWidth: number | null
  ctrlHeld: boolean
}

/**
 * Measures container width via ResizeObserver and tracks Ctrl key state
 * for crosshair cursor.
 *
 * The first measurement applies at once so the PDF can render. Later changes
 * settle for `PREVIEW_RESIZE_SETTLE_MS` before they apply: a divider drag
 * resizes the pane every frame, and re-laying out (and re-rasterizing) every
 * page at each intermediate width would stall the drag itself. A zero width
 * means the pane is not laid out, so the last real width is kept.
 */
export function useContainerSize(
  containerRef: React.RefObject<HTMLDivElement | null>
): ContainerSizeState {
  const [containerWidth, setContainerWidth] = useState<number | null>(null)
  const [ctrlHeld, setCtrlHeld] = useState(false)
  const measuredRef = useRef(false)

  // Track Ctrl key for crosshair cursor
  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey) setCtrlHeld(true)
    }
    const up = (e: KeyboardEvent): void => {
      if (!e.ctrlKey && !e.metaKey) setCtrlHeld(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // Measure container width on mount and resize
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let timer: ReturnType<typeof setTimeout> | null = null
    let latest: number | null = null
    const apply = (): void => {
      timer = null
      if (latest !== null) setContainerWidth(latest)
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) latest = entry.contentRect.width
      }
      if (latest === null) return
      if (!measuredRef.current) {
        measuredRef.current = true
        apply()
        return
      }
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(apply, PREVIEW_RESIZE_SETTLE_MS)
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (timer !== null) clearTimeout(timer)
    }
  }, [containerRef])

  return { containerWidth, ctrlHeld }
}

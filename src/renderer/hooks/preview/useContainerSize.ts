import { useState, useEffect } from 'react'

export interface ContainerSizeState {
  containerWidth: number | null
  ctrlHeld: boolean
}

/**
 * Measures container width via ResizeObserver and tracks Ctrl key state
 * for crosshair cursor.
 */
export function useContainerSize(
  containerRef: React.RefObject<HTMLDivElement | null>
): ContainerSizeState {
  const [containerWidth, setContainerWidth] = useState<number | null>(null)
  const [ctrlHeld, setCtrlHeld] = useState(false)

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
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [containerRef])

  return { containerWidth, ctrlHeld }
}

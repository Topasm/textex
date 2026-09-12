import { useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react'

interface HorizontalResizeOptions {
  enabled?: boolean
  onMove: (clientX: number) => void
  onStart?: () => void
  onStop?: () => void
}

/**
 * Owns the document-level lifecycle for a horizontal resize gesture.
 * Restore selection even when a window switch or an outside release interrupts the drag.
 */
export function useHorizontalResize({
  enabled = true,
  onMove,
  onStart,
  onStop
}: HorizontalResizeOptions): (event: ReactMouseEvent) => void {
  const callbacksRef = useRef({ onMove, onStart, onStop })
  callbacksRef.current = { onMove, onStart, onStop }
  const cleanupRef = useRef<(() => void) | null>(null)

  const stopResize = useCallback(() => {
    cleanupRef.current?.()
    cleanupRef.current = null
  }, [])

  useEffect(() => {
    if (!enabled) stopResize()
    return stopResize
  }, [enabled, stopResize])

  return useCallback(
    (event: ReactMouseEvent) => {
      if (!enabled || event.button !== 0) return

      event.preventDefault()
      stopResize()

      const callbacks = callbacksRef.current
      const previousCursor = document.body.style.cursor
      const previousUserSelect = document.body.style.userSelect
      const move = (moveEvent: MouseEvent): void => {
        if ((moveEvent.buttons & 1) === 0) {
          stopResize()
          return
        }
        callbacks.onMove(moveEvent.clientX)
      }
      const up = (): void => stopResize()

      cleanupRef.current = () => {
        document.body.style.cursor = previousCursor
        document.body.style.userSelect = previousUserSelect
        window.removeEventListener('mousemove', move)
        window.removeEventListener('mouseup', up)
        window.removeEventListener('blur', up)
        callbacks.onStop?.()
      }

      callbacks.onStart?.()
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', up)
      window.addEventListener('blur', up)
    },
    [enabled, stopResize]
  )
}

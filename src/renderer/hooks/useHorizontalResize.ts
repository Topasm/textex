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
 *
 * Pointer moves are coalesced to one `onMove` per animation frame: the first
 * move of a gesture applies at once, later moves inside the same frame only
 * record the newest position, and the frame callback applies it. A PDF pane
 * next to the divider therefore never re-lays out faster than it is drawn.
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
      let frame: number | null = null
      let latestX = 0
      let pending = false
      const flushFrame = (): void => {
        frame = null
        if (!pending) return
        pending = false
        callbacks.onMove(latestX)
        frame = window.requestAnimationFrame(flushFrame)
      }
      const move = (moveEvent: MouseEvent): void => {
        if ((moveEvent.buttons & 1) === 0) {
          stopResize()
          return
        }
        latestX = moveEvent.clientX
        if (frame !== null) {
          pending = true
          return
        }
        callbacks.onMove(latestX)
        frame = window.requestAnimationFrame(flushFrame)
      }
      const up = (): void => stopResize()

      cleanupRef.current = () => {
        if (frame !== null) window.cancelAnimationFrame(frame)
        frame = null
        // Land exactly where the pointer let go, not one frame behind it.
        if (pending) {
          pending = false
          callbacks.onMove(latestX)
        }
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

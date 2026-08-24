import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type RefObject
} from 'react'
import { useProjectStore } from '../store/useProjectStore'

/** Owns the global mouse listeners used while resizing the right Research panel. */
export function useResearchPanelResize(
  panelRef: RefObject<HTMLElement | null>,
  enabled: boolean
): (event: ReactMouseEvent) => void {
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
      event.preventDefault()
      stopResize()
      const right = panelRef.current?.getBoundingClientRect().right ?? window.innerWidth
      const previousCursor = document.body.style.cursor
      const previousUserSelect = document.body.style.userSelect
      const move = (moveEvent: MouseEvent) => {
        useProjectStore.getState().setResearchPanelWidth(right - moveEvent.clientX)
      }
      const up = () => stopResize()
      cleanupRef.current = () => {
        document.body.style.cursor = previousCursor
        document.body.style.userSelect = previousUserSelect
        window.removeEventListener('mousemove', move)
        window.removeEventListener('mouseup', up)
      }
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', up)
    },
    [panelRef, stopResize]
  )
}

import { useRef, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'
import { useProjectStore } from '../store/useProjectStore'
import { useHorizontalResize } from './useHorizontalResize'

/** Owns the global mouse listeners used while resizing the right Research panel. */
export function useResearchPanelResize(
  panelRef: RefObject<HTMLElement | null>,
  enabled: boolean
): (event: ReactMouseEvent) => void {
  const panelRightRef = useRef(window.innerWidth)

  return useHorizontalResize({
    enabled,
    onStart: () => {
      panelRightRef.current = panelRef.current?.getBoundingClientRect().right ?? window.innerWidth
    },
    onMove: (clientX) => {
      useProjectStore.getState().setResearchPanelWidth(panelRightRef.current - clientX)
    }
  })
}

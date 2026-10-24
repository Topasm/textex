import { useRef, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'
import { useProjectStore } from '../store/useProjectStore'
import { RESEARCH_PANEL_WIDTH_MAX } from '../constants'
import { useHorizontalResize } from './useHorizontalResize'

/**
 * Owns the global mouse listeners used while resizing the right Research panel.
 *
 * `maxWidth` is the widest the panel may grow in the current layout (the
 * editor and PDF keep their minimum columns). Clamping here, not only in the
 * layout, keeps the stored width in step with the pointer so dragging back
 * narrows the panel immediately instead of first unwinding an unseen excess.
 */
export function useResearchPanelResize(
  panelRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  maxWidth: number = RESEARCH_PANEL_WIDTH_MAX
): (event: ReactMouseEvent) => void {
  const panelRightRef = useRef(window.innerWidth)
  const maxWidthRef = useRef(maxWidth)
  maxWidthRef.current = maxWidth

  return useHorizontalResize({
    enabled,
    onStart: () => {
      panelRightRef.current = panelRef.current?.getBoundingClientRect().right ?? window.innerWidth
    },
    onMove: (clientX) => {
      useProjectStore
        .getState()
        .setResearchPanelWidth(Math.min(maxWidthRef.current, panelRightRef.current - clientX))
    }
  })
}

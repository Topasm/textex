import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useProjectStore } from '../store/useProjectStore'
import {
  resolveWorkspaceLayout,
  type StackedView,
  type WorkspaceLayout
} from '../utils/workspaceLayout'

interface WorkspaceLayoutOptions {
  /** The row the editor, preview and research panel share. */
  rowRef: RefObject<HTMLElement | null>
  /** The research panel is open and allowed to take part in the layout. */
  researchOpen: boolean
  /** False in the PDF workspace, where the editor column is hidden. */
  editorVisible: boolean
}

export interface WorkspaceLayoutState extends WorkspaceLayout {
  /** Surface shown in the PDF column while the panel is stacked. */
  stackedView: StackedView
  showStackedView: (view: StackedView) => void
}

/**
 * Measures the pane row and resolves the research panel layout from it.
 *
 * Row measurements are coalesced to one per animation frame so a drag on a
 * divider cannot resolve the layout more often than the screen can show it.
 */
export function useWorkspaceLayout({
  rowRef,
  researchOpen,
  editorVisible
}: WorkspaceLayoutOptions): WorkspaceLayoutState {
  const researchWidth = useProjectStore((state) => state.researchPanelWidth)
  const isResearchPanelOpen = useProjectStore((state) => state.isResearchPanelOpen)
  const researchPanelTab = useProjectStore((state) => state.researchPanelTab)
  const [availableWidth, setAvailableWidth] = useState<number | null>(null)
  const [stackedView, setStackedView] = useState<StackedView>('research')

  useLayoutEffect(() => {
    const row = rowRef.current
    if (!row) return
    const initial = row.getBoundingClientRect().width
    if (initial > 0) setAvailableWidth(initial)

    let frame: number | null = null
    let latest: number | null = null
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) latest = entry.contentRect.width
      }
      if (latest === null || frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        if (latest !== null) setAvailableWidth(latest)
      })
    })
    observer.observe(row)
    return () => {
      observer.disconnect()
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [rowRef])

  // Opening the panel, or sending it to another tab (Problems from the status
  // bar, a queued chat prompt), must surface it even when the PDF tab was
  // chosen earlier in the stacked layout.
  const revealRef = useRef({ open: isResearchPanelOpen, tab: researchPanelTab })
  useEffect(() => {
    const previous = revealRef.current
    revealRef.current = { open: isResearchPanelOpen, tab: researchPanelTab }
    if (!isResearchPanelOpen) return
    if (!previous.open || previous.tab !== researchPanelTab) setStackedView('research')
  }, [isResearchPanelOpen, researchPanelTab])

  const showStackedView = useCallback((view: StackedView) => setStackedView(view), [])

  const layout = resolveWorkspaceLayout({
    availableWidth,
    researchOpen,
    researchWidth,
    editorVisible
  })

  return { ...layout, stackedView, showStackedView }
}

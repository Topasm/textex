import { useCallback, useRef } from 'react'
import { useProjectStore } from '../store/useProjectStore'
import type { SidebarView } from '../store/useProjectStore'
import { usePdfStore } from '../store/usePdfStore'
import {
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  SPLIT_RATIO_MAX,
  SPLIT_RATIO_MIN
} from '../constants'
import { getKeyboardResizeValue } from '../utils/keyboardResize'
import { useHorizontalResize } from './useHorizontalResize'
import { usePanelTabSwipe, type SlideAnim } from './usePanelTabSwipe'

export type { SlideAnim }

interface DragResizeHandlers {
  /** Ref to attach to the main content area for split ratio calculation. */
  mainContentRef: React.RefObject<HTMLDivElement | null>
  /** Ref to attach to the sidebar element. */
  sidebarRef: React.RefObject<HTMLDivElement | null>
  /** onMouseDown for the editor ↔ preview split divider. */
  handleDividerMouseDown: (e: React.MouseEvent) => void
  /** onDoubleClick for the split divider (reset to 50%). */
  handleDividerDoubleClick: () => void
  /** Keyboard resizing for the editor ↔ preview separator. */
  handleDividerKeyDown: (e: React.KeyboardEvent) => void
  /** onMouseDown for the sidebar resize handle. */
  handleSidebarDividerMouseDown: (e: React.MouseEvent) => void
  /** onDoubleClick for the sidebar resize handle (reset to 240px). */
  handleSidebarDividerDoubleClick: () => void
  /** Keyboard resizing for the project sidebar separator. */
  handleSidebarDividerKeyDown: (e: React.KeyboardEvent) => void
  /** onWheel handler for sidebar trackpad swipe between tabs. */
  handleSidebarWheel: (e: React.WheelEvent) => void
  /** Current slide animation class for sidebar tab transitions. */
  slideAnim: SlideAnim
}

interface DragResizeOptions {
  sidebarTabs: SidebarView[]
}

interface SidebarBounds {
  left: number
}

export function getSidebarWidthFromPointer(sidebarBounds: SidebarBounds, clientX: number): number {
  return clientX - sidebarBounds.left
}

/**
 * Manages all drag-resize interactions:
 * - Editor ↔ Preview split divider
 * - Sidebar width resize handle
 * - Sidebar trackpad swipe to switch tabs
 */
export function useDragResize({ sidebarTabs }: DragResizeOptions): DragResizeHandlers {
  const mainContentRef = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const sidebarLeftRef = useRef(0)
  const sidebarWrapperRef = useRef<HTMLElement | null>(null)

  // ---- Split divider drag ----
  const handleDividerMouseDown = useHorizontalResize({
    onMove: (clientX) => {
      if (!mainContentRef.current) return
      const rect = mainContentRef.current.getBoundingClientRect()
      if (rect.width <= 0) return
      const ratio = (clientX - rect.left) / rect.width
      usePdfStore.getState().setSplitRatio(ratio)
    }
  })

  const handleDividerDoubleClick = useCallback(() => {
    usePdfStore.getState().setSplitRatio(0.5)
  }, [])

  const handleDividerKeyDown = useCallback((e: React.KeyboardEvent) => {
    const current = usePdfStore.getState().splitRatio
    const next = getKeyboardResizeValue(e, current, {
      min: SPLIT_RATIO_MIN,
      max: SPLIT_RATIO_MAX,
      step: 0.025,
      largeStep: 0.1
    })
    if (next === null) return
    e.preventDefault()
    usePdfStore.getState().setSplitRatio(next)
  }, [])

  // ---- Sidebar resize drag ----
  const handleSidebarDividerMouseDown = useHorizontalResize({
    onStart: () => {
      sidebarLeftRef.current = sidebarRef.current?.getBoundingClientRect().left ?? 0
      sidebarWrapperRef.current = sidebarRef.current?.parentElement ?? null
      // Keep an auto-hidden sidebar expanded while its edge is being dragged.
      sidebarWrapperRef.current?.classList.add('sidebar-dragging')
    },
    onMove: (clientX) => {
      useProjectStore
        .getState()
        .setSidebarWidth(getSidebarWidthFromPointer({ left: sidebarLeftRef.current }, clientX))
    },
    onStop: () => {
      sidebarWrapperRef.current?.classList.remove('sidebar-dragging')
      sidebarWrapperRef.current = null
    }
  })

  const handleSidebarDividerDoubleClick = useCallback(() => {
    useProjectStore.getState().setSidebarWidth(240)
  }, [])

  const handleSidebarDividerKeyDown = useCallback((e: React.KeyboardEvent) => {
    const current = useProjectStore.getState().sidebarWidth
    const next = getKeyboardResizeValue(e, current, {
      min: SIDEBAR_WIDTH_MIN,
      max: SIDEBAR_WIDTH_MAX,
      step: 10,
      largeStep: 40
    })
    if (next === null) return
    e.preventDefault()
    useProjectStore.getState().setSidebarWidth(next)
  }, [])

  // ---- Sidebar swipe / horizontal scroll to switch tabs ----
  const sidebarView = useProjectStore((state) => state.sidebarView)
  const { handleWheel: handleSidebarWheel, slideAnim } = usePanelTabSwipe<SidebarView>({
    tabs: sidebarTabs,
    activeTab: sidebarView,
    onSelect: useCallback((tab: SidebarView) => {
      useProjectStore.getState().setSidebarView(tab)
    }, [])
  })

  return {
    mainContentRef,
    sidebarRef,
    handleDividerMouseDown,
    handleDividerDoubleClick,
    handleDividerKeyDown,
    handleSidebarDividerMouseDown,
    handleSidebarDividerDoubleClick,
    handleSidebarDividerKeyDown,
    handleSidebarWheel,
    slideAnim
  }
}

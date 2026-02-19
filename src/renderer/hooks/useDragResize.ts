import { useCallback, useEffect, useRef, useState } from 'react'
import { useProjectStore } from '../store/useProjectStore'
import type { SidebarView } from '../store/useProjectStore'
import { usePdfStore } from '../store/usePdfStore'
import { SWIPE_LOCK_MS } from '../constants'

export type SlideAnim = 'exit-left' | 'exit-right' | 'enter-left' | 'enter-right' | null

interface DragResizeHandlers {
  /** Ref to attach to the main content area for split ratio calculation. */
  mainContentRef: React.RefObject<HTMLDivElement | null>
  /** Ref to attach to the sidebar element. */
  sidebarRef: React.RefObject<HTMLDivElement | null>
  /** onMouseDown for the editor ↔ preview split divider. */
  handleDividerMouseDown: (e: React.MouseEvent) => void
  /** onDoubleClick for the split divider (reset to 50%). */
  handleDividerDoubleClick: () => void
  /** onMouseDown for the sidebar resize handle. */
  handleSidebarDividerMouseDown: (e: React.MouseEvent) => void
  /** onDoubleClick for the sidebar resize handle (reset to 240px). */
  handleSidebarDividerDoubleClick: () => void
  /** onWheel handler for sidebar trackpad swipe between tabs. */
  handleSidebarWheel: (e: React.WheelEvent) => void
  /** Current slide animation class for sidebar tab transitions. */
  slideAnim: SlideAnim
}

/**
 * Manages all drag-resize interactions:
 * - Editor ↔ Preview split divider
 * - Sidebar width resize handle
 * - Sidebar trackpad swipe to switch tabs
 */
export function useDragResize(): DragResizeHandlers {
  const mainContentRef = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const isSidebarDragging = useRef(false)

  // ---- Split divider drag ----
  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (moveEvent: MouseEvent): void => {
      if (!isDragging.current || !mainContentRef.current) return
      const rect = mainContentRef.current.getBoundingClientRect()
      const ratio = (moveEvent.clientX - rect.left) / rect.width
      usePdfStore.getState().setSplitRatio(Math.min(0.8, Math.max(0.2, ratio)))
    }

    const onMouseUp = (): void => {
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [])

  const handleDividerDoubleClick = useCallback(() => {
    usePdfStore.getState().setSplitRatio(0.5)
  }, [])

  // ---- Sidebar resize drag ----
  const handleSidebarDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isSidebarDragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    // Force sidebar visible during drag so auto-hide doesn't collapse it on hover-loss
    const wrapper = sidebarRef.current?.parentElement
    wrapper?.classList.add('sidebar-dragging')

    const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0

    const onMouseMove = (moveEvent: MouseEvent): void => {
      if (!isSidebarDragging.current) return
      useProjectStore.getState().setSidebarWidth(moveEvent.clientX - sidebarLeft)
    }

    const onMouseUp = (): void => {
      isSidebarDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      wrapper?.classList.remove('sidebar-dragging')
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [])

  const handleSidebarDividerDoubleClick = useCallback(() => {
    useProjectStore.getState().setSidebarWidth(240)
  }, [])

  // ---- Sidebar trackpad swipe to switch tabs ----
  const swipeLocked = useRef(false)
  const swipeEndTimer = useRef<ReturnType<typeof setTimeout>>()
  const slideAnimTimer = useRef<ReturnType<typeof setTimeout>>()
  const slideAnimClearTimer = useRef<ReturnType<typeof setTimeout>>()
  const [slideAnim, setSlideAnim] = useState<SlideAnim>(null)

  // Clean up animation timers on unmount
  useEffect(() => {
    return () => {
      clearTimeout(swipeEndTimer.current)
      clearTimeout(slideAnimTimer.current)
      clearTimeout(slideAnimClearTimer.current)
    }
  }, [])

  const handleSidebarWheel = useCallback((e: React.WheelEvent) => {
    // While locked, ignore all wheel events (including trackpad momentum)
    if (swipeLocked.current) return
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
    if (Math.abs(e.deltaX) < 30) return

    const direction = e.deltaX > 0 ? 1 : -1
    swipeLocked.current = true
    swipeEndTimer.current = setTimeout(() => {
      swipeLocked.current = false
    }, SWIPE_LOCK_MS)

    // Clear any in-flight animation timers before starting new ones
    clearTimeout(slideAnimTimer.current)
    clearTimeout(slideAnimClearTimer.current)

    const s = useProjectStore.getState()
    const tabs: SidebarView[] = ['files', 'bib', 'outline', 'todo', 'timeline', 'git']
    const idx = tabs.indexOf(s.sidebarView)
    const next = tabs[(idx + direction + tabs.length) % tabs.length]

    // Phase 1: slide out
    setSlideAnim(direction > 0 ? 'exit-left' : 'exit-right')
    // Phase 2: switch tab + slide in from opposite side
    slideAnimTimer.current = setTimeout(() => {
      s.setSidebarView(next)
      setSlideAnim(direction > 0 ? 'enter-right' : 'enter-left')
      // Phase 3: clear animation class
      slideAnimClearTimer.current = setTimeout(() => setSlideAnim(null), 120)
    }, 100)
  }, [])

  return {
    mainContentRef,
    sidebarRef,
    handleDividerMouseDown,
    handleDividerDoubleClick,
    handleSidebarDividerMouseDown,
    handleSidebarDividerDoubleClick,
    handleSidebarWheel,
    slideAnim
  }
}

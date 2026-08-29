import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type React from 'react'
import { PANEL_SLIDE_ENTER_MS, PANEL_SLIDE_EXIT_MS } from '../constants'
import { useHorizontalSwipe } from './useHorizontalSwipe'

export type SlideAnim = 'exit-left' | 'exit-right' | 'enter-left' | 'enter-right' | null

export function getPanelSlideAnimation(direction: number): {
  exit: Extract<SlideAnim, 'exit-left' | 'exit-right'>
  enter: Extract<SlideAnim, 'enter-left' | 'enter-right'>
} {
  return direction > 0
    ? { exit: 'exit-left', enter: 'enter-right' }
    : { exit: 'exit-right', enter: 'enter-left' }
}

interface PanelTabSwipeOptions<Tab> {
  /** Tab order the swipe cycles through, in the order the tab strip shows them. */
  tabs: readonly Tab[]
  activeTab: Tab
  onSelect: (tab: Tab) => void
}

interface PanelTabSwipe {
  /** onWheel handler for the panel: a horizontal flick steps one tab. */
  handleWheel: (event: React.WheelEvent) => void
  /** Slide animation class suffix for the panel's content area. */
  slideAnim: SlideAnim
}

/**
 * Swipe between a panel's tabs, sliding the content out and back in.
 *
 * Both the project sidebar and the research panel use this, so a flick feels
 * and looks the same on either side of the editor.
 */
export function usePanelTabSwipe<Tab>({
  tabs,
  activeTab,
  onSelect
}: PanelTabSwipeOptions<Tab>): PanelTabSwipe {
  const [slideAnim, setSlideAnim] = useState<SlideAnim>(null)
  const exitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const clearTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Read through a ref so the wheel handler keeps a stable identity. Written
  // after commit, never during render: a render that never commits must not
  // leave the handler pointing at a tab the panel never showed.
  const latest = useRef({ tabs, activeTab, onSelect })
  // The tab an in-flight slide is on its way to, so a flick that arrives mid
  // animation steps on from where the panel is going, not where it still is.
  const pendingTab = useRef<Tab | null>(null)

  useLayoutEffect(() => {
    latest.current = { tabs, activeTab, onSelect }
    if (pendingTab.current === activeTab) pendingTab.current = null
  })

  useEffect(() => {
    return () => {
      clearTimeout(exitTimer.current)
      clearTimeout(clearTimer.current)
    }
  }, [])

  const swipe = useCallback((direction: 1 | -1) => {
    const { tabs: order, activeTab: shown, onSelect: select } = latest.current
    const current = pendingTab.current ?? shown
    if (order.length < 2) return
    const index = order.indexOf(current)
    if (index === -1) return
    const next = order[(index + direction + order.length) % order.length]
    if (next === current) return

    // Drop any in-flight animation before starting the next one.
    clearTimeout(exitTimer.current)
    clearTimeout(clearTimer.current)
    pendingTab.current = next

    const animation = getPanelSlideAnimation(direction)
    setSlideAnim(animation.exit)
    exitTimer.current = setTimeout(() => {
      select(next)
      setSlideAnim(animation.enter)
      clearTimer.current = setTimeout(() => {
        // A caller that declined the selection must not leave a phantom tab
        // behind for the next flick to step from.
        pendingTab.current = null
        setSlideAnim(null)
      }, PANEL_SLIDE_ENTER_MS)
    }, PANEL_SLIDE_EXIT_MS)
  }, [])

  return { handleWheel: useHorizontalSwipe(swipe), slideAnim }
}

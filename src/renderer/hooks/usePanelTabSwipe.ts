import { useCallback, useEffect, useRef, useState } from 'react'
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

  // Read through a ref so the wheel handler keeps a stable identity.
  const latest = useRef({ tabs, activeTab, onSelect })
  latest.current = { tabs, activeTab, onSelect }

  useEffect(() => {
    return () => {
      clearTimeout(exitTimer.current)
      clearTimeout(clearTimer.current)
    }
  }, [])

  const swipe = useCallback((direction: 1 | -1) => {
    const { tabs: order, activeTab: current, onSelect: select } = latest.current
    if (order.length < 2) return
    const index = order.indexOf(current)
    if (index === -1) return
    const next = order[(index + direction + order.length) % order.length]
    if (next === current) return

    // Drop any in-flight animation before starting the next one.
    clearTimeout(exitTimer.current)
    clearTimeout(clearTimer.current)

    const animation = getPanelSlideAnimation(direction)
    setSlideAnim(animation.exit)
    exitTimer.current = setTimeout(() => {
      select(next)
      setSlideAnim(animation.enter)
      clearTimer.current = setTimeout(() => setSlideAnim(null), PANEL_SLIDE_ENTER_MS)
    }, PANEL_SLIDE_EXIT_MS)
  }, [])

  return { handleWheel: useHorizontalSwipe(swipe), slideAnim }
}

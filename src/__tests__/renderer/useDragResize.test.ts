import { act, cleanup, renderHook } from '@testing-library/react'
import type { KeyboardEvent, WheelEvent } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSidebarWidthFromPointer, useDragResize } from '../../renderer/hooks/useDragResize'
import { getPanelSlideAnimation } from '../../renderer/hooks/usePanelTabSwipe'
import { PANEL_SLIDE_ENTER_MS, PANEL_SLIDE_EXIT_MS, SWIPE_LOCK_MS } from '../../renderer/constants'
import { usePdfStore } from '../../renderer/store/usePdfStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import type { SidebarView } from '../../renderer/store/useProjectStore'

const SIDEBAR_TABS: SidebarView[] = ['files', 'git', 'outline']

function wheel(deltaX: number, deltaY: number): WheelEvent {
  return { deltaX, deltaY } as WheelEvent
}

describe('useDragResize helpers', () => {
  it('calculates sidebar width from the fixed left edge', () => {
    expect(getSidebarWidthFromPointer({ left: 100 }, 280)).toBe(180)
  })

  it('uses the left-sidebar slide animation direction', () => {
    expect(getPanelSlideAnimation(1)).toEqual({
      exit: 'exit-left',
      enter: 'enter-right'
    })
  })

  it('resizes the editor split and sidebar from keyboard separators', () => {
    usePdfStore.setState({ splitRatio: 0.5 })
    useProjectStore.setState({ sidebarWidth: 240 })
    const { result } = renderHook(() => useDragResize({ sidebarTabs: ['files'] }))
    const preventDefault = vi.fn()

    act(() => {
      result.current.handleDividerKeyDown({
        key: 'ArrowRight',
        shiftKey: false,
        preventDefault
      } as unknown as KeyboardEvent)
      result.current.handleSidebarDividerKeyDown({
        key: 'ArrowRight',
        shiftKey: true,
        preventDefault
      } as unknown as KeyboardEvent)
    })

    expect(usePdfStore.getState().splitRatio).toBe(0.525)
    expect(useProjectStore.getState().sidebarWidth).toBe(280)
    expect(preventDefault).toHaveBeenCalledTimes(2)
  })
})

describe('sidebar tab swipe', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useProjectStore.setState({ sidebarView: 'files' })
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('steps one tab per flick and lands it after the slide', () => {
    const { result } = renderHook(() => useDragResize({ sidebarTabs: SIDEBAR_TABS }))

    act(() => result.current.handleSidebarWheel(wheel(60, 2)))
    expect(result.current.slideAnim).toBe('exit-left')
    // The tab only changes once the outgoing content has left.
    expect(useProjectStore.getState().sidebarView).toBe('files')

    act(() => vi.advanceTimersByTime(PANEL_SLIDE_EXIT_MS))
    expect(useProjectStore.getState().sidebarView).toBe('git')
    expect(result.current.slideAnim).toBe('enter-right')

    act(() => vi.advanceTimersByTime(PANEL_SLIDE_ENTER_MS))
    expect(result.current.slideAnim).toBeNull()
  })

  it('leaves no half-finished slide when a momentum tail outlives it', () => {
    const { result } = renderHook(() => useDragResize({ sidebarTabs: SIDEBAR_TABS }))

    act(() => {
      // The tail keeps arriving straight through the exit and enter timers.
      for (const deltaX of [90, 140, 180, 150, 120, 95, 75, 60, 48, 38, 30, 24, 19, 15, 12, 9]) {
        result.current.handleSidebarWheel(wheel(deltaX, 2))
        vi.advanceTimersByTime(16)
      }
      vi.advanceTimersByTime(PANEL_SLIDE_EXIT_MS + PANEL_SLIDE_ENTER_MS)
    })

    expect(useProjectStore.getState().sidebarView).toBe('git')
    expect(result.current.slideAnim).toBeNull()
  })

  it('keeps the switch floor above the full slide animation', () => {
    expect(SWIPE_LOCK_MS).toBeGreaterThanOrEqual(PANEL_SLIDE_EXIT_MS + PANEL_SLIDE_ENTER_MS)
  })
})

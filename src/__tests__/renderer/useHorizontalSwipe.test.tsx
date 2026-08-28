import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type React from 'react'
import { useHorizontalSwipe } from '../../renderer/hooks/useHorizontalSwipe'
import { SWIPE_GESTURE_IDLE_MS, SWIPE_LOCK_MS } from '../../renderer/constants'

function wheel(deltaX: number, deltaY: number): React.WheelEvent {
  return { deltaX, deltaY } as React.WheelEvent
}

describe('useHorizontalSwipe', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('ignores a scroll that is more vertical than horizontal', () => {
    const onSwipe = vi.fn()
    const { result } = renderHook(() => useHorizontalSwipe(onSwipe))

    act(() => result.current(wheel(20, 40)))
    expect(onSwipe).not.toHaveBeenCalled()
  })

  it('ignores a trackpad nudge below the threshold', () => {
    const onSwipe = vi.fn()
    const { result } = renderHook(() => useHorizontalSwipe(onSwipe))

    act(() => result.current(wheel(20, 1)))
    expect(onSwipe).not.toHaveBeenCalled()
  })

  it('reports direction for a decisive trackpad swipe', () => {
    const onSwipe = vi.fn()
    const { result } = renderHook(() => useHorizontalSwipe(onSwipe))

    act(() => result.current(wheel(60, 2)))
    expect(onSwipe).toHaveBeenCalledWith(1)

    act(() => vi.advanceTimersByTime(SWIPE_LOCK_MS + 1))
    act(() => result.current(wheel(-60, 2)))
    expect(onSwipe).toHaveBeenLastCalledWith(-1)
  })

  it('accepts the smaller steps of a discrete thumb wheel', () => {
    const onSwipe = vi.fn()
    const { result } = renderHook(() => useHorizontalSwipe(onSwipe))

    act(() => result.current(wheel(8, 0)))
    expect(onSwipe).toHaveBeenCalledOnce()
  })

  it('fires once per flick rather than once per event', () => {
    const onSwipe = vi.fn()
    const { result } = renderHook(() => useHorizontalSwipe(onSwipe))

    act(() => {
      // A single trackpad flick arrives as a burst of wheel events.
      for (let index = 0; index < 12; index += 1) {
        result.current(wheel(60, 2))
        vi.advanceTimersByTime(16)
      }
    })
    expect(onSwipe).toHaveBeenCalledOnce()
  })

  it('does not let a fast flick momentum tail steal a second step', () => {
    const onSwipe = vi.fn()
    const { result } = renderHook(() => useHorizontalSwipe(onSwipe))

    act(() => {
      // A hard flick: a peak, then momentum that decays but stays above the
      // trigger for far longer than the lock window.
      for (const travel of [140, 180, 160, 120, 90, 70, 55, 44, 38, 33, 31]) {
        result.current(wheel(travel, 2))
        vi.advanceTimersByTime(16)
      }
    })
    expect(onSwipe).toHaveBeenCalledOnce()
  })

  it('starts a new gesture once the wheel stream goes quiet', () => {
    const onSwipe = vi.fn()
    const { result } = renderHook(() => useHorizontalSwipe(onSwipe))

    act(() => result.current(wheel(60, 2)))
    act(() => vi.advanceTimersByTime(SWIPE_GESTURE_IDLE_MS + SWIPE_LOCK_MS))
    act(() => result.current(wheel(60, 2)))

    expect(onSwipe).toHaveBeenCalledTimes(2)
  })

  it('re-arms when a momentum tail decays to a standstill', () => {
    const onSwipe = vi.fn()
    const { result } = renderHook(() => useHorizontalSwipe(onSwipe))

    act(() => {
      result.current(wheel(120, 2))
      for (const travel of [40, 20, 8, 3]) {
        vi.advanceTimersByTime(16)
        result.current(wheel(travel, 2))
      }
      // The next flick begins before the idle gap, but the tail already ended.
      vi.advanceTimersByTime(SWIPE_LOCK_MS)
      result.current(wheel(120, 2))
    })

    expect(onSwipe).toHaveBeenCalledTimes(2)
  })
})

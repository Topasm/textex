import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHorizontalSwipe, type SwipeWheelEvent } from '../../renderer/hooks/useHorizontalSwipe'
import { SWIPE_GESTURE_IDLE_MS, SWIPE_LOCK_MS } from '../../renderer/constants'

type Send = (event: SwipeWheelEvent) => void

function wheel(
  deltaX: number,
  deltaY: number,
  extra: Partial<SwipeWheelEvent> = {}
): SwipeWheelEvent {
  return {
    deltaX,
    deltaY,
    deltaMode: 0,
    ctrlKey: false,
    shiftKey: false,
    target: null,
    currentTarget: null,
    ...extra
  }
}

/** Replay a burst of wheel events the way a device delivers them, in order. */
function burst(
  send: Send,
  steps: readonly number[],
  options: { deltaY?: number; gap?: number; extra?: Partial<SwipeWheelEvent> } = {}
): void {
  const { deltaY = 2, gap = 16, extra } = options
  act(() => {
    for (const deltaX of steps) {
      send(wheel(deltaX, deltaY, extra))
      vi.advanceTimersByTime(gap)
    }
  })
}

/** A hard macOS flick: a peak, then a long tail that decays but keeps moving. */
const MACOS_FLICK = [90, 140, 180, 160, 130, 105, 85, 70, 57, 47, 39, 32, 27, 22, 18, 15, 12, 10]

function makeScroller(options: {
  scrollWidth: number
  clientWidth: number
  scrollLeft: number
  overflowX: string
}): { panel: HTMLElement; inner: HTMLElement } {
  const panel = document.createElement('div')
  const scroller = document.createElement('div')
  const inner = document.createElement('span')
  scroller.style.overflowX = options.overflowX
  Object.defineProperty(scroller, 'scrollWidth', { value: options.scrollWidth })
  Object.defineProperty(scroller, 'clientWidth', { value: options.clientWidth })
  Object.defineProperty(scroller, 'scrollLeft', { value: options.scrollLeft, writable: true })
  scroller.appendChild(inner)
  panel.appendChild(scroller)
  document.body.appendChild(panel)
  return { panel, inner }
}

describe('useHorizontalSwipe', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    document.body.innerHTML = ''
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

    act(() => vi.advanceTimersByTime(SWIPE_LOCK_MS + SWIPE_GESTURE_IDLE_MS))
    act(() => result.current(wheel(-60, 2)))
    expect(onSwipe).toHaveBeenLastCalledWith(-1)
  })

  it('fires once per flick rather than once per event', () => {
    const onSwipe = vi.fn()
    const { result } = renderHook(() => useHorizontalSwipe(onSwipe))

    // A single trackpad flick arrives as a burst of wheel events.
    burst(
      result.current,
      Array.from({ length: 12 }, () => 60)
    )
    expect(onSwipe).toHaveBeenCalledOnce()
  })

  it('does not let a macOS momentum tail steal a second step', () => {
    const onSwipe = vi.fn()
    const { result } = renderHook(() => useHorizontalSwipe(onSwipe))

    // The tail outlives the lock by a wide margin, at sub-frame spacing.
    burst(result.current, MACOS_FLICK, { gap: 8 })
    expect(onSwipe).toHaveBeenCalledOnce()
  })

  it('does not let a tail that fluctuates instead of decaying steal a step', () => {
    const onSwipe = vi.fn()
    const { result } = renderHook(() => useHorizontalSwipe(onSwipe))

    // Noisy hardware: the tail sags and picks back up several times, and runs
    // well past the lock window.
    burst(result.current, [140, 60, 20, 5, 12, 40, 25, 10, 34, 18, 31, 12, 36, 20, 30, 14, 33], {
      gap: 16
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

    burst(result.current, [120, 40, 20, 8, 3, 1, 0.5, 0.2, 0], { gap: 16 })
    // The next flick begins before the idle gap, but the tail already ended.
    act(() => vi.advanceTimersByTime(SWIPE_LOCK_MS))
    act(() => result.current(wheel(120, 2)))

    expect(onSwipe).toHaveBeenCalledTimes(2)
  })

  it('takes a second flick thrown while the first tail is still running', () => {
    const onSwipe = vi.fn()
    const { result } = renderHook(() => useHorizontalSwipe(onSwipe))

    // The tail is still emitting when the user flicks again: momentum never
    // speeds back up, so the surge has to count as a fresh gesture.
    burst(result.current, MACOS_FLICK, { gap: 16 })
    burst(result.current, [40, 110, 150, 130, 100, 80], { gap: 16 })

    expect(onSwipe).toHaveBeenCalledTimes(2)
  })

  it('takes a flick back the other way without waiting for the tail to die', () => {
    const onSwipe = vi.fn()
    const { result } = renderHook(() => useHorizontalSwipe(onSwipe))

    burst(result.current, [120, 100, 80, 60, 45, 35, 28, 22, 18, 14, 11, 9, 7, 6, 5, 4, 3], {
      gap: 16
    })
    burst(result.current, [-60, -120, -90], { gap: 16 })

    expect(onSwipe).toHaveBeenNthCalledWith(1, 1)
    expect(onSwipe).toHaveBeenNthCalledWith(2, -1)
  })

  it('commits a slow, deliberate two-finger swipe', () => {
    const onSwipe = vi.fn()
    const { result } = renderHook(() => useHorizontalSwipe(onSwipe))

    // No single event clears the trigger; the swipe is unmistakable anyway.
    burst(result.current, [4, 7, 9, 10, 9, 8, 8, 7, 6, 5], { deltaY: 1, gap: 16 })
    expect(onSwipe).toHaveBeenCalledOnce()
  })

  it('ignores sideways jitter during a long vertical scroll', () => {
    const onSwipe = vi.fn()
    const { result } = renderHook(() => useHorizontalSwipe(onSwipe))

    act(() => {
      for (let index = 0; index < 40; index += 1) {
        // One frame of the jitter is horizontal enough to pass a per-event test.
        const deltaX = index === 20 ? 34 : index % 2 === 0 ? 6 : -5
        result.current(wheel(deltaX, 40))
        vi.advanceTimersByTime(16)
      }
    })

    expect(onSwipe).not.toHaveBeenCalled()
  })

  it('picks up a diagonal flick once it turns horizontal', () => {
    const onSwipe = vi.fn()
    const { result } = renderHook(() => useHorizontalSwipe(onSwipe))

    act(() => {
      for (const [deltaX, deltaY] of [
        [2, 30],
        [4, 28],
        [10, 22],
        [25, 12],
        [45, 4],
        [60, 2],
        [55, 1],
        [40, 1]
      ]) {
        result.current(wheel(deltaX, deltaY))
        vi.advanceTimersByTime(16)
      }
    })

    expect(onSwipe).toHaveBeenCalledOnce()
    expect(onSwipe).toHaveBeenCalledWith(1)
  })

  it('steps once per notch of a discrete wheel reporting lines', () => {
    const onSwipe = vi.fn()
    const { result } = renderHook(() => useHorizontalSwipe(onSwipe))

    // WebKitGTK and Firefox report a wheel notch as one line, not 100 pixels.
    act(() => result.current(wheel(1, 0, { deltaMode: 1 })))
    expect(onSwipe).toHaveBeenCalledWith(1)

    act(() => vi.advanceTimersByTime(SWIPE_LOCK_MS + SWIPE_GESTURE_IDLE_MS))
    act(() => result.current(wheel(-1, 0, { deltaMode: 1 })))
    expect(onSwipe).toHaveBeenLastCalledWith(-1)
  })

  it('takes one step from a free-spinning thumb wheel, not one per event', () => {
    const onSwipe = vi.fn()
    const { result } = renderHook(() => useHorizontalSwipe(onSwipe))

    // An MX Master free spin: a long burst of pure-horizontal notches.
    burst(
      result.current,
      Array.from({ length: 30 }, () => 100),
      { deltaY: 0, gap: 8 }
    )
    expect(onSwipe).toHaveBeenCalledOnce()
  })

  it('steps once per deliberate thumb-wheel notch', () => {
    const onSwipe = vi.fn()
    const { result } = renderHook(() => useHorizontalSwipe(onSwipe))

    act(() => {
      for (let index = 0; index < 3; index += 1) {
        result.current(wheel(100, 0))
        vi.advanceTimersByTime(300)
      }
    })

    expect(onSwipe).toHaveBeenCalledTimes(3)
  })

  it('steps for a Windows precision touchpad flick, which has no momentum', () => {
    const onSwipe = vi.fn()
    const { result } = renderHook(() => useHorizontalSwipe(onSwipe))

    // Pure horizontal, no vertical component, and the stream simply stops.
    burst(result.current, [12, 28, 40, 36, 24, 14], { deltaY: 0, gap: 12 })
    expect(onSwipe).toHaveBeenCalledOnce()

    act(() => vi.advanceTimersByTime(SWIPE_LOCK_MS))
    burst(result.current, [12, 28, 40, 36, 24, 14], { deltaY: 0, gap: 12 })
    expect(onSwipe).toHaveBeenCalledTimes(2)
  })

  it('treats Shift+wheel reported as vertical travel as a horizontal step', () => {
    const onSwipe = vi.fn()
    const { result } = renderHook(() => useHorizontalSwipe(onSwipe))

    act(() => result.current(wheel(0, 100, { shiftKey: true })))
    expect(onSwipe).toHaveBeenCalledWith(1)
  })

  it('leaves pinch-zoom alone', () => {
    const onSwipe = vi.fn()
    const { result } = renderHook(() => useHorizontalSwipe(onSwipe))

    burst(result.current, [60, 80, 70], { extra: { ctrlKey: true } })
    expect(onSwipe).not.toHaveBeenCalled()
  })

  it('leaves the gesture to a sideways scroller that can still move', () => {
    const onSwipe = vi.fn()
    const { result } = renderHook(() => useHorizontalSwipe(onSwipe))
    const { panel, inner } = makeScroller({
      scrollWidth: 800,
      clientWidth: 400,
      scrollLeft: 120,
      overflowX: 'auto'
    })

    burst(result.current, [60, 90, 70], { extra: { target: inner, currentTarget: panel } })
    expect(onSwipe).not.toHaveBeenCalled()
  })

  it('takes the gesture back once that scroller is against the edge', () => {
    const onSwipe = vi.fn()
    const { result } = renderHook(() => useHorizontalSwipe(onSwipe))
    const { panel, inner } = makeScroller({
      scrollWidth: 800,
      clientWidth: 400,
      scrollLeft: 400,
      overflowX: 'auto'
    })

    act(() => result.current(wheel(60, 2, { target: inner, currentTarget: panel })))
    expect(onSwipe).toHaveBeenCalledWith(1)

    // It still owns the other direction, where it has room left.
    act(() => vi.advanceTimersByTime(SWIPE_LOCK_MS + SWIPE_GESTURE_IDLE_MS))
    act(() => result.current(wheel(-60, 2, { target: inner, currentTarget: panel })))
    expect(onSwipe).toHaveBeenCalledOnce()
  })

  it('keeps a gesture the inner scroller claimed even when it hits the edge', () => {
    const onSwipe = vi.fn()
    const { result } = renderHook(() => useHorizontalSwipe(onSwipe))
    const scroller = makeScroller({
      scrollWidth: 800,
      clientWidth: 400,
      scrollLeft: 100,
      overflowX: 'auto'
    })
    const target = { target: scroller.inner, currentTarget: scroller.panel }

    act(() => result.current(wheel(60, 2, target)))
    expect(onSwipe).not.toHaveBeenCalled()

    // The same flick runs the scroller to its end; the panel must not take over
    // halfway through a gesture that was never its own.
    const element = scroller.inner.parentElement as HTMLElement
    Object.defineProperty(element, 'scrollLeft', { value: 400, writable: true })
    burst(result.current, [60, 60, 60, 60], { extra: target })
    expect(onSwipe).not.toHaveBeenCalled()
  })

  it('survives a wall-clock jump between two flicks', () => {
    const onSwipe = vi.fn()
    const { result } = renderHook(() => useHorizontalSwipe(onSwipe))

    act(() => result.current(wheel(60, 2)))
    // An NTP correction or a timezone edit moves Date.now backwards.
    act(() => vi.setSystemTime(Date.now() - 3_600_000))
    act(() => vi.advanceTimersByTime(SWIPE_GESTURE_IDLE_MS + SWIPE_LOCK_MS))
    act(() => result.current(wheel(60, 2)))

    expect(onSwipe).toHaveBeenCalledTimes(2)
  })

  it('takes the first flick of the session immediately', () => {
    const onSwipe = vi.fn()
    const { result } = renderHook(() => useHorizontalSwipe(onSwipe))

    // Nothing has happened yet, so no lock or idle bookkeeping may hold it back.
    act(() => result.current(wheel(60, 2)))
    expect(onSwipe).toHaveBeenCalledOnce()
  })
})

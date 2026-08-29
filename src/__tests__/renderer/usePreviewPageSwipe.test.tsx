import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { usePreviewPageSwipe } from '../../renderer/hooks/preview/usePreviewPageSwipe'
import { usePdfStore } from '../../renderer/store/usePdfStore'
import { SWIPE_GESTURE_IDLE_MS, SWIPE_LOCK_MS } from '../../renderer/constants'
import { SWIPE_COOLDOWN_MS, SWIPE_THRESHOLD } from '../../renderer/components/previewUtils'

function mountContainer(): {
  container: HTMLDivElement
  ref: React.RefObject<HTMLDivElement | null>
} {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const ref = createRef<HTMLDivElement>() as React.RefObject<HTMLDivElement | null>
  ref.current = container
  return { container, ref }
}

function renderSwipe(pdfViewMode: 'single' | 'continuous' = 'single') {
  const { container, ref } = mountContainer()
  const rendered = renderHook(() => usePreviewPageSwipe({ containerRef: ref, pdfViewMode }))
  return { container, ...rendered }
}

function wheel(container: HTMLElement, deltaX: number, deltaY: number): boolean {
  return container.dispatchEvent(
    new WheelEvent('wheel', { deltaX, deltaY, bubbles: true, cancelable: true })
  )
}

describe('usePreviewPageSwipe', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    usePdfStore.setState({ currentPage: 3, numPages: 12 })
  })
  afterEach(() => {
    cleanup()
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  it('turns exactly one page for a single trackpad flick', () => {
    const { container } = renderSwipe()

    act(() => {
      // A flick arrives as a burst of wheel events, not a single one.
      for (let index = 0; index < 12; index += 1) {
        wheel(container, 60, 2)
        vi.advanceTimersByTime(16)
      }
    })

    expect(usePdfStore.getState().currentPage).toBe(4)
  })

  it('does not let a fast flick momentum tail skip a second page', () => {
    const { container } = renderSwipe()

    act(() => {
      // A hard flick: a peak, then momentum decaying but staying above the
      // trigger for longer than the old cooldown window.
      for (const travel of [140, 180, 160, 120, 90, 70, 55, 44, 38, 33, 31]) {
        wheel(container, travel, 2)
        vi.advanceTimersByTime(16)
      }
    })

    expect(usePdfStore.getState().currentPage).toBe(4)
  })

  it('turns a second page once the wheel stream goes quiet', () => {
    const { container } = renderSwipe()

    act(() => wheel(container, 60, 2))
    act(() => vi.advanceTimersByTime(SWIPE_GESTURE_IDLE_MS + SWIPE_LOCK_MS))
    act(() => wheel(container, 60, 2))

    expect(usePdfStore.getState().currentPage).toBe(5)
  })

  it('goes back a page and animates the other way', () => {
    const { container, result } = renderSwipe()

    act(() => wheel(container, -60, 2))

    expect(usePdfStore.getState().currentPage).toBe(2)
    expect(result.current.slideDirection).toBe('right')
  })

  it('stops at the last page', () => {
    usePdfStore.setState({ currentPage: 12, numPages: 12 })
    const { container } = renderSwipe()

    act(() => wheel(container, 60, 2))

    expect(usePdfStore.getState().currentPage).toBe(12)
  })

  it('still turns pages on accumulated vertical scroll in single-page mode', () => {
    const { container } = renderSwipe()

    act(() => {
      // Below the vertical threshold: nothing yet.
      wheel(container, 0, SWIPE_THRESHOLD / 2)
    })
    expect(usePdfStore.getState().currentPage).toBe(3)

    act(() => wheel(container, 0, SWIPE_THRESHOLD / 2))
    expect(usePdfStore.getState().currentPage).toBe(4)

    // The vertical cooldown keeps the rest of the same scroll from stacking.
    act(() => wheel(container, 0, SWIPE_THRESHOLD))
    expect(usePdfStore.getState().currentPage).toBe(4)

    act(() => vi.advanceTimersByTime(SWIPE_COOLDOWN_MS + 1))
    act(() => wheel(container, 0, SWIPE_THRESHOLD))
    expect(usePdfStore.getState().currentPage).toBe(5)
  })

  it('scrolls sideways instead of paging in continuous mode', () => {
    const { container } = renderSwipe('continuous')

    act(() => wheel(container, 60, 2))

    expect(usePdfStore.getState().currentPage).toBe(3)
    expect(container.scrollLeft).toBe(60)
  })

  it('scrolls a line-mode notch by its pixels in continuous mode', () => {
    const { container } = renderSwipe('continuous')

    // WebKitGTK reports a notch as lines, not pixels; scrolling by the raw
    // delta would move the page a single pixel.
    act(() => {
      container.dispatchEvent(
        new WheelEvent('wheel', {
          deltaX: 2,
          deltaY: 0,
          deltaMode: WheelEvent.DOM_DELTA_LINE,
          bubbles: true,
          cancelable: true
        })
      )
    })

    expect(container.scrollLeft).toBeGreaterThan(2)
  })

  it('leaves Ctrl+wheel to the zoom handler', () => {
    const { container } = renderSwipe()

    const allowed = container.dispatchEvent(
      new WheelEvent('wheel', { deltaX: 60, deltaY: 2, ctrlKey: true, cancelable: true })
    )

    expect(usePdfStore.getState().currentPage).toBe(3)
    expect(allowed).toBe(true)
  })

  it('steps a page from the keyboard through the same path', () => {
    const { result } = renderSwipe()

    act(() => {
      expect(result.current.stepPage(1)).toBe(true)
    })
    expect(usePdfStore.getState().currentPage).toBe(4)
    expect(result.current.slideDirection).toBe('left')
  })
})

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PREVIEW_RESIZE_SETTLE_MS } from '../../renderer/constants'
import { useContainerSize } from '../../renderer/hooks/preview/useContainerSize'

type ResizeCallback = (entries: Array<{ contentRect: { width: number } }>) => void

describe('useContainerSize', () => {
  let resizeCallback: ResizeCallback | null = null

  beforeEach(() => {
    vi.useFakeTimers()
    resizeCallback = null
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeCallback) {
          resizeCallback = callback
        }
        observe = vi.fn()
        unobserve = vi.fn()
        disconnect = vi.fn()
      }
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  function resize(width: number) {
    act(() => resizeCallback?.([{ contentRect: { width } }]))
  }

  it('applies the first measurement at once and lets later ones settle', () => {
    const containerRef = { current: document.createElement('div') }
    const { result } = renderHook(() => useContainerSize(containerRef))

    resize(800)
    expect(result.current.containerWidth).toBe(800)

    // A divider drag resizes the pane every frame; the PDF holds its width
    // until the pointer pauses instead of re-laying out at each step.
    resize(790)
    resize(760)
    resize(700)
    expect(result.current.containerWidth).toBe(800)

    act(() => vi.advanceTimersByTime(PREVIEW_RESIZE_SETTLE_MS - 1))
    expect(result.current.containerWidth).toBe(800)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.containerWidth).toBe(700)
  })

  it('keeps the last laid-out width while the pane has no box', () => {
    const containerRef = { current: document.createElement('div') }
    const { result } = renderHook(() => useContainerSize(containerRef))

    resize(0)
    expect(result.current.containerWidth).toBeNull()

    resize(640)
    expect(result.current.containerWidth).toBe(640)

    resize(0)
    act(() => vi.advanceTimersByTime(PREVIEW_RESIZE_SETTLE_MS))
    expect(result.current.containerWidth).toBe(640)
  })
})

import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAnimatedPresence } from '../../renderer/hooks/useAnimatedPresence'

describe('useAnimatedPresence', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('enters on the next animation frame and remains mounted through exit', () => {
    vi.useFakeTimers()
    let runFrame: FrameRequestCallback | undefined
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      runFrame = callback
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})

    const { result, rerender } = renderHook(({ visible }) => useAnimatedPresence(visible, 180), {
      initialProps: { visible: false }
    })

    expect(result.current).toEqual({ mounted: false, phase: 'entered' })

    rerender({ visible: true })
    expect(result.current).toEqual({ mounted: true, phase: 'entering' })

    act(() => runFrame?.(0))
    expect(result.current).toEqual({ mounted: true, phase: 'entered' })

    rerender({ visible: false })
    expect(result.current).toEqual({ mounted: true, phase: 'exiting' })

    act(() => vi.advanceTimersByTime(179))
    expect(result.current.mounted).toBe(true)

    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toEqual({ mounted: false, phase: 'entered' })
  })

  it('does not animate a surface that starts visible', () => {
    const { result } = renderHook(() => useAnimatedPresence(true))
    expect(result.current).toEqual({ mounted: true, phase: 'entered' })
  })
})

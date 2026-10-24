import { act, fireEvent, renderHook } from '@testing-library/react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useHorizontalResize } from '../../renderer/hooks/useHorizontalResize'

function leftMouseDown(): ReactMouseEvent {
  return {
    button: 0,
    preventDefault: vi.fn()
  } as unknown as ReactMouseEvent
}

describe('useHorizontalResize', () => {
  afterEach(() => {
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  })

  it('forwards pointer movement and restores body state on mouse-up', () => {
    document.body.style.cursor = 'crosshair'
    document.body.style.userSelect = 'text'
    const onMove = vi.fn()
    const onStart = vi.fn()
    const onStop = vi.fn()
    const { result } = renderHook(() => useHorizontalResize({ onMove, onStart, onStop }))
    const mouseDown = leftMouseDown()

    act(() => result.current(mouseDown))
    expect(mouseDown.preventDefault).toHaveBeenCalledOnce()
    expect(onStart).toHaveBeenCalledOnce()
    expect(document.body.style.cursor).toBe('col-resize')
    expect(document.body.style.userSelect).toBe('none')

    fireEvent.mouseMove(window, { clientX: 412, buttons: 1 })
    expect(onMove).toHaveBeenCalledWith(412)

    fireEvent.mouseUp(window)
    expect(onStop).toHaveBeenCalledOnce()
    expect(document.body.style.cursor).toBe('crosshair')
    expect(document.body.style.userSelect).toBe('text')
  })

  it('applies at most one move per animation frame and lands on the release point', () => {
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback)
      return frames.length
    })
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    const onMove = vi.fn()
    const { result } = renderHook(() => useHorizontalResize({ onMove }))

    act(() => result.current(leftMouseDown()))
    fireEvent.mouseMove(window, { clientX: 100, buttons: 1 })
    fireEvent.mouseMove(window, { clientX: 110, buttons: 1 })
    fireEvent.mouseMove(window, { clientX: 120, buttons: 1 })
    // The first move responds at once; the rest wait for the frame.
    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onMove).toHaveBeenLastCalledWith(100)
    expect(frames).toHaveLength(1)

    act(() => frames.splice(0).forEach((frame) => frame(0)))
    expect(onMove).toHaveBeenCalledTimes(2)
    expect(onMove).toHaveBeenLastCalledWith(120)
    // Moves kept coming, so the gate stays closed for another frame.
    expect(frames).toHaveLength(1)

    fireEvent.mouseMove(window, { clientX: 130, buttons: 1 })
    fireEvent.mouseUp(window)
    expect(cancel).toHaveBeenCalled()
    expect(onMove).toHaveBeenCalledTimes(3)
    expect(onMove).toHaveBeenLastCalledWith(130)

    vi.restoreAllMocks()
  })

  it('cleans up an active gesture when disabled or unmounted', () => {
    const onStop = vi.fn()
    const { result, rerender, unmount } = renderHook(
      ({ enabled }) => useHorizontalResize({ enabled, onMove: vi.fn(), onStop }),
      { initialProps: { enabled: true } }
    )

    act(() => result.current(leftMouseDown()))
    rerender({ enabled: false })
    expect(onStop).toHaveBeenCalledOnce()
    expect(document.body.style.cursor).toBe('')

    rerender({ enabled: true })
    act(() => result.current(leftMouseDown()))
    unmount()
    expect(onStop).toHaveBeenCalledTimes(2)
    expect(document.body.style.cursor).toBe('')
  })

  it('restores selection when the window loses focus during a resize', () => {
    const onMove = vi.fn()
    const onStop = vi.fn()
    const { result } = renderHook(() => useHorizontalResize({ onMove, onStop }))

    act(() => result.current(leftMouseDown()))
    fireEvent.blur(window)

    expect(document.body.style.userSelect).toBe('')
    expect(document.body.style.cursor).toBe('')
    expect(onStop).toHaveBeenCalledOnce()
    fireEvent.mouseMove(window, { clientX: 412, buttons: 1 })
    fireEvent.mouseUp(window)
    expect(onMove).not.toHaveBeenCalled()
    expect(onStop).toHaveBeenCalledOnce()
  })

  it('stops resizing on return when the mouse was released outside the window', () => {
    const onMove = vi.fn()
    const onStop = vi.fn()
    const { result } = renderHook(() => useHorizontalResize({ onMove, onStop }))

    act(() => result.current(leftMouseDown()))
    fireEvent.mouseMove(window, { clientX: 412, buttons: 0 })

    expect(document.body.style.userSelect).toBe('')
    expect(document.body.style.cursor).toBe('')
    expect(onMove).not.toHaveBeenCalled()
    expect(onStop).toHaveBeenCalledOnce()
  })

  it('ignores non-primary mouse buttons', () => {
    const onMove = vi.fn()
    const { result } = renderHook(() => useHorizontalResize({ onMove }))
    const preventDefault = vi.fn()

    act(() => result.current({ button: 2, preventDefault } as unknown as ReactMouseEvent))
    fireEvent.mouseMove(window, { clientX: 120 })

    expect(preventDefault).not.toHaveBeenCalled()
    expect(onMove).not.toHaveBeenCalled()
  })
})

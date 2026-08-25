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

    fireEvent.mouseMove(window, { clientX: 412 })
    expect(onMove).toHaveBeenCalledWith(412)

    fireEvent.mouseUp(window)
    expect(onStop).toHaveBeenCalledOnce()
    expect(document.body.style.cursor).toBe('crosshair')
    expect(document.body.style.userSelect).toBe('text')
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

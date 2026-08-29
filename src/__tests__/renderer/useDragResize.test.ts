import { act, renderHook } from '@testing-library/react'
import type { KeyboardEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { getSidebarWidthFromPointer, useDragResize } from '../../renderer/hooks/useDragResize'
import { getPanelSlideAnimation } from '../../renderer/hooks/usePanelTabSwipe'
import { usePdfStore } from '../../renderer/store/usePdfStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'

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

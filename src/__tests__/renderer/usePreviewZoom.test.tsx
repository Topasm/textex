import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { usePreviewZoom } from '../../renderer/hooks/preview/usePreviewZoom'
import { usePdfStore } from '../../renderer/store/usePdfStore'
import { DEBOUNCE_ZOOM_MS } from '../../renderer/constants'

it('cancels a pending zoom when leaving the PDF view', () => {
  vi.useFakeTimers()
  try {
    usePdfStore.setState({ zoomLevel: 100 })
    const container = document.createElement('div')
    const { unmount } = renderHook(() => usePreviewZoom({ current: container }))
    act(() => container.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -20 })))
    unmount()
    act(() => vi.advanceTimersByTime(DEBOUNCE_ZOOM_MS + 1))
    expect(usePdfStore.getState().zoomLevel).toBe(100)
  } finally {
    vi.useRealTimers()
  }
})

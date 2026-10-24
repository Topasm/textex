import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EDITOR_PANE_MIN_WIDTH,
  PREVIEW_PANE_MIN_WIDTH,
  RESEARCH_PANEL_WIDTH_MAX,
  RESEARCH_PANEL_WIDTH_MIN,
  SPLIT_DIVIDER_WIDTH
} from '../../renderer/constants'
import { useWorkspaceLayout } from '../../renderer/hooks/useWorkspaceLayout'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { minimumPaneRowWidth, resolveWorkspaceLayout } from '../../renderer/utils/workspaceLayout'

const THREE_PANE_MIN =
  EDITOR_PANE_MIN_WIDTH + SPLIT_DIVIDER_WIDTH + PREVIEW_PANE_MIN_WIDTH + RESEARCH_PANEL_WIDTH_MIN

describe('resolveWorkspaceLayout', () => {
  it('hides the panel from the layout while it is closed', () => {
    expect(
      resolveWorkspaceLayout({
        availableWidth: 1400,
        researchOpen: false,
        researchWidth: 380,
        editorVisible: true
      })
    ).toEqual({ mode: 'hidden', researchWidth: 0, maxResearchWidth: RESEARCH_PANEL_WIDTH_MAX })
  })

  it('places the panel beside the editor and the PDF when three columns fit', () => {
    expect(
      resolveWorkspaceLayout({
        availableWidth: 1400,
        researchOpen: true,
        researchWidth: 380,
        editorVisible: true
      })
    ).toEqual({ mode: 'side', researchWidth: 380, maxResearchWidth: RESEARCH_PANEL_WIDTH_MAX })
  })

  it('narrows the panel before giving up the third column', () => {
    const layout = resolveWorkspaceLayout({
      availableWidth: THREE_PANE_MIN + 40,
      researchOpen: true,
      researchWidth: 480,
      editorVisible: true
    })
    expect(layout.mode).toBe('side')
    expect(layout.researchWidth).toBe(RESEARCH_PANEL_WIDTH_MIN + 40)
    expect(layout.maxResearchWidth).toBe(RESEARCH_PANEL_WIDTH_MIN + 40)
  })

  it('stacks the panel into the PDF column once three columns cannot fit', () => {
    expect(
      resolveWorkspaceLayout({
        availableWidth: THREE_PANE_MIN - 1,
        researchOpen: true,
        researchWidth: 380,
        editorVisible: true
      })
    ).toEqual({ mode: 'stacked', researchWidth: 0, maxResearchWidth: RESEARCH_PANEL_WIDTH_MIN })
    expect(
      resolveWorkspaceLayout({
        availableWidth: THREE_PANE_MIN,
        researchOpen: true,
        researchWidth: 380,
        editorVisible: true
      }).mode
    ).toBe('side')
  })

  it('only needs room for the PDF and the panel in the PDF workspace', () => {
    expect(minimumPaneRowWidth(false)).toBe(PREVIEW_PANE_MIN_WIDTH)
    const width = PREVIEW_PANE_MIN_WIDTH + RESEARCH_PANEL_WIDTH_MIN + 10
    expect(
      resolveWorkspaceLayout({
        availableWidth: width,
        researchOpen: true,
        researchWidth: 380,
        editorVisible: false
      })
    ).toEqual({
      mode: 'side',
      researchWidth: RESEARCH_PANEL_WIDTH_MIN + 10,
      maxResearchWidth: RESEARCH_PANEL_WIDTH_MIN + 10
    })
    expect(
      resolveWorkspaceLayout({
        availableWidth: width,
        researchOpen: true,
        researchWidth: 380,
        editorVisible: true
      }).mode
    ).toBe('stacked')
  })

  it('assumes the side layout until the row has been measured', () => {
    expect(
      resolveWorkspaceLayout({
        availableWidth: null,
        researchOpen: true,
        researchWidth: 600,
        editorVisible: true
      })
    ).toEqual({ mode: 'side', researchWidth: RESEARCH_PANEL_WIDTH_MAX, maxResearchWidth: 520 })
  })
})

type ResizeCallback = (entries: Array<{ contentRect: { width: number } }>) => void

describe('useWorkspaceLayout', () => {
  let resizeCallback: ResizeCallback | null = null
  let frames: FrameRequestCallback[] = []
  const observe = vi.fn()
  const disconnect = vi.fn()

  function rowOfWidth(width: number) {
    const row = document.createElement('div')
    row.getBoundingClientRect = () => ({ width }) as DOMRect
    return { current: row }
  }

  function resizeRowTo(width: number) {
    act(() => {
      resizeCallback?.([{ contentRect: { width } }])
      const pending = frames.splice(0)
      for (const frame of pending) frame(0)
    })
  }

  beforeEach(() => {
    frames = []
    resizeCallback = null
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeCallback) {
          resizeCallback = callback
        }
        observe = observe
        unobserve = vi.fn()
        disconnect = disconnect
      }
    )
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback)
      return frames.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    useProjectStore.setState({
      isResearchPanelOpen: true,
      researchPanelTab: 'chat',
      researchPanelWidth: 380
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('measures the row once on mount and follows it through resize observations', () => {
    const rowRef = rowOfWidth(1400)
    const { result } = renderHook(() =>
      useWorkspaceLayout({ rowRef, researchOpen: true, editorVisible: true })
    )

    expect(observe).toHaveBeenCalledWith(rowRef.current)
    expect(result.current.mode).toBe('side')
    expect(result.current.researchWidth).toBe(380)

    resizeRowTo(THREE_PANE_MIN - 20)
    expect(result.current.mode).toBe('stacked')

    resizeRowTo(THREE_PANE_MIN + 30)
    expect(result.current.mode).toBe('side')
    expect(result.current.researchWidth).toBe(RESEARCH_PANEL_WIDTH_MIN + 30)
  })

  it('coalesces a burst of resize observations into one animation frame', () => {
    const rowRef = rowOfWidth(1400)
    const { result } = renderHook(() =>
      useWorkspaceLayout({ rowRef, researchOpen: true, editorVisible: true })
    )

    act(() => {
      resizeCallback?.([{ contentRect: { width: 700 } }])
      resizeCallback?.([{ contentRect: { width: 720 } }])
      resizeCallback?.([{ contentRect: { width: 1300 } }])
    })
    expect(frames).toHaveLength(1)
    expect(result.current.mode).toBe('side')
    expect(result.current.researchWidth).toBe(380)

    act(() => frames.splice(0).forEach((frame) => frame(0)))
    expect(result.current.mode).toBe('side')

    resizeRowTo(700)
    expect(result.current.mode).toBe('stacked')
  })

  it('shows the research surface again whenever the panel is opened or sent to a tab', () => {
    const rowRef = rowOfWidth(700)
    const { result } = renderHook(() =>
      useWorkspaceLayout({ rowRef, researchOpen: true, editorVisible: true })
    )
    expect(result.current.mode).toBe('stacked')
    expect(result.current.stackedView).toBe('research')

    act(() => result.current.showStackedView('preview'))
    expect(result.current.stackedView).toBe('preview')

    act(() => useProjectStore.getState().openResearchPanel('problems'))
    expect(result.current.stackedView).toBe('research')

    act(() => result.current.showStackedView('preview'))
    act(() => useProjectStore.getState().closeResearchPanel())
    expect(result.current.stackedView).toBe('preview')
    act(() => useProjectStore.getState().openResearchPanel())
    expect(result.current.stackedView).toBe('research')
  })

  it('disconnects the observer on unmount', () => {
    const { unmount } = renderHook(() =>
      useWorkspaceLayout({ rowRef: rowOfWidth(1400), researchOpen: true, editorVisible: true })
    )
    unmount()
    expect(disconnect).toHaveBeenCalled()
  })
})

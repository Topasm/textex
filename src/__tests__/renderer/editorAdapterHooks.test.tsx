import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorAdapter } from '../../renderer/editor/EditorAdapter'
import { usePendingActions } from '../../renderer/hooks/editor/usePendingActions'
import { useCompileStore } from '../../renderer/store/useCompileStore'
import { useEditorStore } from '../../renderer/store/useEditorStore'

function createAdapter() {
  const decorationDisposable = { dispose: vi.fn() }
  const adapter = {
    getDocumentId: vi.fn(() => '/project/main.tex'),
    getPosition: vi.fn(() => ({ line: 3, column: 5 })),
    applyEdits: vi.fn(() => true),
    focus: vi.fn(),
    revealPosition: vi.fn(),
    setDecorations: vi.fn(() => decorationDisposable)
  } as unknown as EditorAdapter
  return { adapter, decorationDisposable }
}

describe('EditorAdapter hook integration', () => {
  beforeEach(() => {
    useEditorStore.setState({ pendingJump: null, pendingInsertText: null })
  })

  it('routes pending insert operations through the editor-neutral adapter', () => {
    const { adapter } = createAdapter()
    renderHook(() => usePendingActions({ current: adapter }))

    act(() => {
      useEditorStore.getState().requestInsertAtCursor('\\cite{key}')
    })

    expect(adapter.applyEdits).toHaveBeenCalledWith('pending-insert', [
      {
        range: {
          start: { line: 3, column: 5 },
          end: { line: 3, column: 5 }
        },
        text: '\\cite{key}',
        forceMoveMarkers: true
      }
    ])
    expect(adapter.focus).toHaveBeenCalled()
    expect(useEditorStore.getState().pendingInsertText).toBeNull()
  })

  it('routes jumps and tracked line highlights through the adapter', () => {
    vi.useFakeTimers()
    const { adapter, decorationDisposable } = createAdapter()
    renderHook(() => usePendingActions({ current: adapter }))

    act(() => {
      useEditorStore.getState().requestJumpToLine(12, 4, true)
    })

    expect(adapter.revealPosition).toHaveBeenCalledWith(
      { line: 12, column: 4 },
      { center: true, focus: false }
    )
    expect(adapter.setDecorations).toHaveBeenCalledWith('pending-jump', [
      {
        range: {
          start: { line: 12, column: 1 },
          end: { line: 12, column: 1 }
        },
        isWholeLine: true,
        className: 'editor-flash-line',
        marginClassName: 'editor-flash-gutter'
      }
    ])

    act(() => vi.advanceTimersByTime(1200))
    expect(decorationDisposable.dispose).toHaveBeenCalledTimes(1)
    expect(useEditorStore.getState().pendingJump).toBeNull()
    vi.useRealTimers()
  })
})

describe('scoped pending PDF jumps', () => {
  beforeEach(() => {
    useEditorStore.getState().resetEditor()
    useEditorStore.getState().openFileInTab('/project/main.tex', 'Source')
    useCompileStore.setState({ pdfRevision: 1 })
  })
  function request() {
    const state = useEditorStore.getState()
    state.requestJumpToLine(1, 3, false, {
      documentId: '/project/main.tex',
      revision: state.revision,
      pdfRevision: 1,
      tabMutationEpoch: state.tabMutationEpoch
    })
  }
  it('waits until the adapter is bound to the intended document', () => {
    const { adapter, decorationDisposable } = createAdapter()
    const ref = { current: null as EditorAdapter | null }
    const { result, unmount } = renderHook(() => usePendingActions(ref))
    act(request)
    expect(useEditorStore.getState().pendingJump).not.toBeNull()
    ref.current = adapter
    vi.mocked(adapter.getDocumentId).mockReturnValue('/project/other.tex')
    act(() => result.current())
    expect(adapter.revealPosition).not.toHaveBeenCalled()
    vi.mocked(adapter.getDocumentId).mockReturnValue('/project/main.tex')
    act(() => result.current())
    expect(adapter.revealPosition).toHaveBeenCalledWith(
      { line: 1, column: 3 },
      { center: true, focus: true }
    )
    expect(useEditorStore.getState().pendingJump).toBeNull()
    unmount()
    expect(decorationDisposable.dispose).toHaveBeenCalledTimes(1)
  })
  it.each(['edit', 'tab', 'pdf'] as const)('discards a pending jump after %s changes', (change) => {
    const { adapter } = createAdapter()
    const ref = { current: null as EditorAdapter | null }
    const { result } = renderHook(() => usePendingActions(ref))
    act(request)
    act(() => {
      if (change === 'edit') useEditorStore.getState().updateActiveDocument('Changed')
      if (change === 'tab') useEditorStore.getState().openFileInTab('/project/other.tex', 'Other')
      if (change === 'pdf') useCompileStore.setState({ pdfRevision: 2 })
    })
    ref.current = adapter
    act(() => result.current())
    expect(adapter.revealPosition).not.toHaveBeenCalled()
    expect(useEditorStore.getState().pendingJump).toBeNull()
  })
})

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorAdapter } from '../../renderer/editor/EditorAdapter'
import { usePendingActions } from '../../renderer/hooks/editor/usePendingActions'
import { useEditorStore } from '../../renderer/store/useEditorStore'

function createAdapter() {
  const decorationDisposable = { dispose: vi.fn() }
  const adapter = {
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

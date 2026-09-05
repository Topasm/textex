import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorAdapter } from '../../renderer/editor/EditorAdapter'
import { usePreviewSourceHighlight } from '../../renderer/hooks/editor/usePreviewSourceHighlight'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useCompileStore } from '../../renderer/store/useCompileStore'

describe('TeX preview selection decoration', () => {
  beforeEach(() => {
    useEditorStore.getState().resetEditor()
    useEditorStore.getState().openFileInTab('/project/main.tex', 'A selected passage.')
    useCompileStore.setState({ pdfRevision: 1 })
  })

  it('highlights and reveals the passage without stealing focus, and clears it on edits', () => {
    const setDecorations = vi.fn()
    const clearDecorations = vi.fn()
    const revealPosition = vi.fn()
    const ref = {
      current: {
        getDocumentId: () => '/project/main.tex',
        setDecorations,
        clearDecorations,
        revealPosition
      } as unknown as EditorAdapter
    }
    const { unmount } = renderHook(() => usePreviewSourceHighlight(ref))
    const range = { start: { line: 1, column: 3 }, end: { line: 1, column: 11 } }
    act(() =>
      useEditorStore.getState().setPreviewSourceHighlight({
        filePath: '/project/main.tex',
        revision: useEditorStore.getState().revision,
        pdfRevision: 1,
        range,
        text: 'selected'
      })
    )
    expect(setDecorations).toHaveBeenLastCalledWith('preview-selection', [
      { range, className: 'editor-preview-selection' }
    ])
    expect(revealPosition).toHaveBeenCalledWith(range.start, { center: true, focus: false })
    setDecorations.mockClear()
    clearDecorations.mockClear()
    act(() => useEditorStore.getState().updateActiveDocument('A changed passage.'))
    expect(clearDecorations).toHaveBeenCalledWith('preview-selection')
    expect(setDecorations).not.toHaveBeenCalled()
    unmount()
  })
})

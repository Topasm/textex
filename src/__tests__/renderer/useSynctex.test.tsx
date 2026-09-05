import { documentRegistry } from '../../renderer/models/documentRegistry'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSynctex } from '../../renderer/hooks/preview/useSynctex'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useCompileStore } from '../../renderer/store/useCompileStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { capturePdfSourceContext } from '../../renderer/services/pdfSourceNavigation'
import { registerPendingDocumentEditFlusher } from '../../renderer/services/pendingDocumentEdits'
import type { SyncTeXInverseResult } from '../../shared/types'

const sourcePath = '/project/main.tex'
let container: HTMLDivElement
function setup() {
  const page = container.firstElementChild as HTMLDivElement
  const containerRef = { current: container }
  const pageRef = {
    current: new Map([
      [
        1,
        {
          element: page,
          pageWidth: 600,
          pageHeight: 800,
          viewport: {
            viewBox: [0, 0, 600, 800],
            convertToViewportPoint: (x: number, y: number) => [x, y]
          }
        }
      ]
    ])
  }
  return renderHook(() => useSynctex(containerRef, pageRef, 1))
}

describe('inverse SyncTeX authority', () => {
  beforeEach(() => {
    useEditorStore.getState().resetEditor()
    useEditorStore.getState().openFileInTab(sourcePath, 'Heading\nSource text')
    useProjectStore.getState().setProjectRoot('/project')
    useCompileStore.setState({
      pdfRevision: 1,
      pdfDocumentId: sourcePath,
      pdfDocumentRevision: useEditorStore.getState().revision,
      compileStatus: 'success'
    })
    container = document.createElement('div')
    container.innerHTML = '<div data-pdf-generation="1"></div>'
    document.body.appendChild(container)
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 600, 800))
    vi.spyOn(container.firstElementChild!, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 600, 800)
    )
    vi.mocked(window.api.synctexInverse)
      .mockReset()
      .mockResolvedValue({ file: sourcePath, line: 2, column: 3 })
  })
  afterEach(() => {
    cleanup()
    container.remove()
    vi.restoreAllMocks()
  })

  it('uses the compiled root while an include is active and queues a scoped jump immediately', async () => {
    useEditorStore.getState().openFileInTab('/project/include.tex', 'Include')
    const { result } = setup()
    await act(async () => result.current.handleSyncToCode())
    expect(window.api.synctexInverse).toHaveBeenCalledWith(sourcePath, 1, 300, 400)
    expect(useEditorStore.getState().filePath).toBe(sourcePath)
    expect(useEditorStore.getState().pendingJump).toMatchObject({
      line: 2,
      column: 3,
      target: {
        documentId: sourcePath,
        revision: 0,
        pdfRevision: 1,
        tabMutationEpoch: useEditorStore.getState().tabMutationEpoch
      }
    })
  })

  it.each(['edit', 'project', 'pdf', 'tab', 'selection', 'unmount'] as const)(
    'discards a delayed response after %s changes',
    async (change) => {
      let resolve!: (result: SyncTeXInverseResult) => void
      vi.mocked(window.api.synctexInverse).mockImplementation(
        () =>
          new Promise((done) => {
            resolve = done
          })
      )
      const { result, unmount } = setup()
      act(() => result.current.handleSyncToCode())
      act(() => {
        if (change === 'edit') useEditorStore.getState().updateActiveDocument('Changed')
        if (change === 'project') useProjectStore.getState().setProjectRoot('/other')
        if (change === 'pdf') useCompileStore.setState({ pdfRevision: 2 })
        if (change === 'tab') useEditorStore.getState().openFileInTab('/project/other.tex', 'Other')
        if (change === 'selection') capturePdfSourceContext(1)
        if (change === 'unmount') unmount()
      })
      await act(async () => resolve({ file: sourcePath, line: 2, column: 1 }))
      expect(useEditorStore.getState().pendingJump).toBeNull()
    }
  )

  it('flushes buffered prose before activating a source and rejects the outdated PDF', async () => {
    const unregister = registerPendingDocumentEditFlusher(sourcePath, () =>
      useEditorStore.getState().updateActiveDocument('Buffered edit')
    )
    try {
      const { result } = setup()
      await act(async () => result.current.handleSyncToCode())
      expect(useEditorStore.getState().pendingJump).toBeNull()
      expect(documentRegistry.snapshot(sourcePath)?.text).toBe('Buffered edit')
    } finally {
      unregister()
    }
  })

  it('rejects invalid source lines', async () => {
    vi.mocked(window.api.synctexInverse).mockResolvedValue({
      file: sourcePath,
      line: 99,
      column: 1
    })
    const { result } = setup()
    await act(async () => result.current.handleSyncToCode())
    expect(useEditorStore.getState().pendingJump).toBeNull()
  })
})

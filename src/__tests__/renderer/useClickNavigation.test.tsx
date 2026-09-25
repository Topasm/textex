import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { editor as Monaco } from 'monaco-editor'
import { useClickNavigation } from '../../renderer/hooks/editor/useClickNavigation'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useCompileStore } from '../../renderer/store/useCompileStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { usePdfStore } from '../../renderer/store/usePdfStore'

const path = '/project/main.tex'
const source = 'First sentence. Second sentence.'
let mouseUp: (event: Monaco.IEditorMouseEvent) => void
const event = (detail: number) =>
  ({
    event: { detail },
    target: { type: 6, position: { lineNumber: 1, column: 22 } }
  }) as Monaco.IEditorMouseEvent
function setup() {
  const { result } = renderHook(() => useClickNavigation())
  return result.current({
    onMouseDown: () => ({ dispose: vi.fn() }),
    onMouseUp: (handler: typeof mouseUp) => {
      mouseUp = handler
      return { dispose: vi.fn() }
    }
  } as unknown as Monaco.IStandaloneCodeEditor)
}
beforeEach(() => {
  useEditorStore.getState().resetEditor()
  useEditorStore.getState().openFileInTab(path, source)
  useProjectStore.setState({ projectRoot: '/project' })
  useCompileStore.setState({
    pdfRevision: 1,
    pdfDocumentId: path,
    pdfDocumentRevision: 0,
    compileStatus: 'success'
  })
  usePdfStore.setState({ synctexHighlight: null })
  window.api.synctexForward = vi.fn().mockResolvedValue({ page: 1, x: 50, y: 100 })
})
it('double-clicks sync the selected sentence while single clicks do not', async () => {
  const registration = setup()
  await act(async () => mouseUp(event(1)))
  expect(window.api.synctexForward).not.toHaveBeenCalled()
  await act(async () => mouseUp(event(2)))
  expect(window.api.synctexForward).toHaveBeenCalledWith(path, 1)
  expect(usePdfStore.getState().synctexHighlight).toMatchObject({
    sentence: 'Second sentence.',
    pdfRevision: 1
  })
  expect(useEditorStore.getState().previewSourceHighlight?.range).toEqual({
    start: { line: 1, column: 17 },
    end: { line: 1, column: 33 }
  })
  registration.dispose()
})
it.each(['edit', 'project', 'pdf', 'tab', 'dispose'] as const)(
  'discards a delayed forward result after %s changes',
  async (change) => {
    let resolve!: (result: { page: number; x: number; y: number }) => void
    window.api.synctexForward = vi.fn().mockReturnValue(
      new Promise((done) => {
        resolve = done
      })
    )
    const registration = setup()
    act(() => mouseUp(event(2)))
    act(() => {
      if (change === 'edit') useEditorStore.getState().updateActiveDocument('Changed')
      if (change === 'project') useProjectStore.setState({ projectRoot: '/other' })
      if (change === 'pdf') useCompileStore.setState({ pdfRevision: 2 })
      if (change === 'tab') useEditorStore.getState().openFileInTab('/project/other.tex', 'Other')
      if (change === 'dispose') registration.dispose()
    })
    await act(async () => resolve({ page: 1, x: 50, y: 100 }))
    expect(usePdfStore.getState().synctexHighlight).toBeNull()
    registration.dispose()
  }
)
it('does not sync dirty source text against the previous PDF', async () => {
  const registration = setup()
  act(() => useEditorStore.getState().updateActiveDocument('Changed'))
  await act(async () => mouseUp(event(2)))
  expect(window.api.synctexForward).not.toHaveBeenCalled()
  registration.dispose()
})

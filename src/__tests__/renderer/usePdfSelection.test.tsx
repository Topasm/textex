import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePdfSelection } from '../../renderer/hooks/preview/usePdfSelection'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useCompileStore } from '../../renderer/store/useCompileStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import type { SyncTeXInverseResult } from '../../shared/types'

const sourcePath = '/project/main.tex'
const source = 'Heading\nThe efficient method works.\nAnother sentence.'
let container: HTMLDivElement
let page: HTMLDivElement
let range: Range
let selection: Selection

function setup() {
  return renderHook(() =>
    usePdfSelection(
      { current: container },
      { current: new Map([[1, { element: page, pageWidth: 600, pageHeight: 800 }]]) },
      1
    )
  )
}

async function select() {
  await act(async () => {
    document.dispatchEvent(new Event('selectionchange'))
    await vi.advanceTimersByTimeAsync(110)
  })
}

describe('PDF selection synchronization', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useEditorStore.getState().resetEditor()
    useEditorStore.getState().openFileInTab(sourcePath, source)
    useProjectStore.getState().setProjectRoot('/project')
    useCompileStore.setState({
      pdfRevision: 1,
      pdfDocumentId: sourcePath,
      pdfDocumentRevision: useEditorStore.getState().revision,
      pdfPath: '/cache/main.pdf',
      compileStatus: 'success'
    })
    container = document.createElement('div')
    container.innerHTML =
      '<div data-pdf-generation="1"><div data-page-number="1"><span>The efficient method works.</span></div></div>'
    document.body.appendChild(container)
    page = container.querySelector('[data-page-number]')!
    const text = page.querySelector('span')!.firstChild!
    range = document.createRange()
    range.setStart(text, 4)
    range.setEnd(text, 20)
    vi.spyOn(range, 'cloneRange').mockReturnValue(range)
    Object.defineProperty(range, 'getClientRects', {
      value: () => [new DOMRect(110, 220, 160, 20)]
    })
    vi.spyOn(page, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 1200, 1600))
    selection = {
      rangeCount: 1,
      isCollapsed: false,
      getRangeAt: () => range,
      toString: () => 'efficient method'
    } as unknown as Selection
    vi.spyOn(window, 'getSelection').mockReturnValue(selection)
    vi.mocked(window.api.synctexInverse)
      .mockReset()
      .mockResolvedValue({ file: sourcePath, line: 2, column: 1 })
    vi.mocked(window.api.readFile).mockReset()
  })

  afterEach(() => {
    cleanup()
    container.remove()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('maps drag selection through the compiled document and scaled page coordinates', async () => {
    setup()
    await select()
    expect(window.api.synctexInverse).toHaveBeenNthCalledWith(1, sourcePath, 1, 50.5, 105)
    expect(window.api.synctexInverse).toHaveBeenNthCalledWith(2, sourcePath, 1, 129.5, 105)
    expect(useEditorStore.getState().previewSourceHighlight).toMatchObject({
      filePath: sourcePath,
      pdfRevision: 1,
      text: 'efficient method',
      range: { start: { line: 2, column: 5 }, end: { line: 2, column: 21 } }
    })
    expect(window.api.readFile).not.toHaveBeenCalled()
  })

  it('opens a project-contained include file and highlights its matching passage', async () => {
    vi.mocked(window.api.synctexInverse).mockResolvedValue({
      file: '/project/chapter.tex',
      line: 2,
      column: 1
    })
    vi.mocked(window.api.readFile).mockResolvedValue({
      filePath: '/project/chapter.tex',
      content: source
    })
    setup()
    await select()
    expect(useEditorStore.getState().filePath).toBe('/project/chapter.tex')
    expect(useEditorStore.getState().previewSourceHighlight?.filePath).toBe('/project/chapter.tex')
  })

  it.each(['edit', 'compile', 'project', 'selection', 'unmount'] as const)(
    'discards an inverse result after %s changes',
    async (change) => {
      let resolve!: (result: SyncTeXInverseResult) => void
      const response = new Promise<SyncTeXInverseResult>((done) => {
        resolve = done
      })
      vi.mocked(window.api.synctexInverse).mockReturnValue(response)
      const hook = setup()
      await select()
      act(() => {
        if (change === 'edit') useEditorStore.getState().updateActiveDocument(`${source}\nNew text`)
        if (change === 'compile') useCompileStore.setState({ pdfRevision: 2 })
        if (change === 'project') useProjectStore.getState().setProjectRoot('/elsewhere')
        if (change === 'selection') vi.mocked(window.getSelection).mockReturnValue(null)
        if (change === 'unmount') hook.unmount()
      })
      await act(async () => resolve({ file: sourcePath, line: 2, column: 1 }))
      expect(useEditorStore.getState().previewSourceHighlight).toBeNull()
    }
  )

  it('does not apply old-PDF locations to an edited source or hidden generation', async () => {
    setup()
    act(() => useEditorStore.getState().updateActiveDocument(`${source}\nChanged`))
    await select()
    expect(window.api.synctexInverse).not.toHaveBeenCalled()
  })

  it('clears the source highlight when the PDF selection collapses', async () => {
    setup()
    await select()
    expect(useEditorStore.getState().previewSourceHighlight).not.toBeNull()
    vi.mocked(window.getSelection).mockReturnValue({
      ...selection,
      isCollapsed: true,
      toString: () => ''
    } as Selection)
    await select()
    expect(useEditorStore.getState().previewSourceHighlight).toBeNull()
  })
})

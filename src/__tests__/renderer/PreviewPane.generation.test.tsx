import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PreviewPane from '../../renderer/components/PreviewPane'
import { useCompileStore } from '../../renderer/store/useCompileStore'
import { usePdfStore } from '../../renderer/store/usePdfStore'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'

vi.mock('../../renderer/hooks/preview/useContainerSize', () => ({
  useContainerSize: () => ({ containerWidth: 800, ctrlHeld: false })
}))

vi.mock('../../renderer/hooks/preview/usePreviewZoom', () => ({
  usePreviewZoom: () => ({ transientScale: null })
}))

vi.mock('../../renderer/hooks/preview/useSynctex', () => ({
  useSynctex: () => ({
    highlights: { lineStyle: null, dotStyle: null },
    handleContainerClick: vi.fn()
  })
}))

vi.mock('../../renderer/hooks/preview/useScrollSync', () => ({ useScrollSync: () => {} }))
vi.mock('../../renderer/hooks/preview/usePdfSearch', () => ({
  usePdfSearch: () => ({ searchVisible: false })
}))
vi.mock('../../renderer/hooks/preview/useCitationTooltip', () => ({
  useCitationTooltip: () => ({ tooltipData: null })
}))

vi.mock('react-pdf', async () => {
  const React = await import('react')
  const GenerationContext = React.createContext(0)

  interface MockDocumentProps {
    file: { data: Uint8Array }
    onLoadSuccess: (result: { numPages: number }) => void
    children: React.ReactNode
  }

  interface MockPageProps {
    pageNumber: number
    onRenderSuccess: (page: {
      getViewport: (options: { scale: number }) => {
        width: number
        height: number
        viewBox: number[]
        convertToViewportPoint: (x: number, y: number) => [number, number]
      }
    }) => void
  }

  const Document = ({ file, onLoadSuccess, children }: MockDocumentProps) => {
    const generation = file.data[0]
    React.useEffect(() => {
      onLoadSuccess({ numPages: 12 })
      // The file object is stable for the lifetime of one preview generation.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [file])
    return <GenerationContext.Provider value={generation}>{children}</GenerationContext.Provider>
  }

  const Page = ({ pageNumber, onRenderSuccess }: MockPageProps) => {
    const generation = React.useContext(GenerationContext)
    return (
      <div data-page-number={pageNumber}>
        <button
          data-testid={`render-${generation}-${pageNumber}`}
          onClick={() =>
            onRenderSuccess({
              getViewport: ({ scale }) => ({
                width: 600 * scale,
                height: 800 * scale,
                viewBox: [0, 0, 600, 800],
                convertToViewportPoint: (x, y) => [x * scale, y * scale]
              })
            })
          }
        >
          render
        </button>
      </div>
    )
  }

  return {
    Document,
    Page,
    pdfjs: { GlobalWorkerOptions: { workerSrc: '' } }
  }
})

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('PreviewPane PDF generation swap', () => {
  beforeEach(() => {
    vi.mocked(window.api.readCompiledPdf).mockReset()
    useCompileStore.setState({
      compileStatus: 'idle',
      pdfPath: null,
      pdfRevision: 0,
      pdfDocumentId: null,
      pdfDocumentRevision: null
    })
    usePdfStore.setState({
      currentPage: 1,
      numPages: 0,
      zoomLevel: 100,
      savedScrollPositions: {},
      savedViewPositions: {}
    })
    useProjectStore.getState().setProjectRoot(null)
    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, pdfViewMode: 'continuous', pdfInvertMode: false }
    }))
  })

  it('keeps the previous layer visible until the pending current page renders', async () => {
    const firstRead = deferred<{ data: Uint8Array; mimeType: string }>()
    const secondRead = deferred<{ data: Uint8Array; mimeType: string }>()
    vi.mocked(window.api.readCompiledPdf)
      .mockReturnValueOnce(firstRead.promise)
      .mockReturnValueOnce(secondRead.promise)

    const { container } = render(<PreviewPane />)

    act(() => useCompileStore.getState().setPdfPath('/project/main.pdf'))
    await act(async () =>
      firstRead.resolve({ data: new Uint8Array([1]), mimeType: 'application/pdf' })
    )

    await waitFor(() =>
      expect(container.querySelector('[data-pdf-generation="1"]')).toBeInTheDocument()
    )
    const firstLayer = container.querySelector('[data-pdf-generation="1"]')
    expect(firstLayer).toHaveAttribute('aria-hidden', 'false')

    act(() => useCompileStore.getState().setPdfPath('/project/main.pdf'))
    await act(async () =>
      secondRead.resolve({ data: new Uint8Array([2]), mimeType: 'application/pdf' })
    )

    await waitFor(() =>
      expect(container.querySelector('[data-pdf-generation="2"]')).toBeInTheDocument()
    )
    const pendingLayer = container.querySelector('[data-pdf-generation="2"]')
    expect(container.querySelector('[data-pdf-generation="1"]')).toHaveAttribute(
      'aria-hidden',
      'false'
    )
    expect(pendingLayer).toHaveAttribute('aria-hidden', 'true')

    fireEvent.click(await screen.findByTestId('render-2-1'))

    await waitFor(() => {
      expect(container.querySelector('[data-pdf-generation="1"]')).not.toBeInTheDocument()
      expect(container.querySelector('[data-pdf-generation="2"]')).toHaveAttribute(
        'aria-hidden',
        'false'
      )
    })
  })

  it('keeps page, zoom, and scroll position across a generation swap', async () => {
    vi.mocked(window.api.readCompiledPdf)
      .mockResolvedValueOnce({ data: new Uint8Array([1]), mimeType: 'application/pdf' })
      .mockResolvedValueOnce({ data: new Uint8Array([2]), mimeType: 'application/pdf' })
    useProjectStore.getState().setProjectRoot('/project')

    const { container } = render(<PreviewPane />)
    act(() =>
      useCompileStore.getState().setPdfPath('/project/main.pdf', {
        documentId: '/project/main.tex',
        revision: 1
      })
    )
    await waitFor(() =>
      expect(container.querySelector('[data-pdf-generation="1"]')).toBeInTheDocument()
    )

    const preview = container.querySelector('.preview-container') as HTMLDivElement
    act(() => usePdfStore.getState().setZoomLevel(135))
    preview.scrollTop = 6_400
    fireEvent.scroll(preview)
    await waitFor(() => expect(usePdfStore.getState().currentPage).toBe(5))

    act(() =>
      useCompileStore.getState().setPdfPath('/project/main.pdf', {
        documentId: '/project/main.tex',
        revision: 2
      })
    )
    fireEvent.click(await screen.findByTestId('render-2-5'))

    await waitFor(() =>
      expect(container.querySelector('[data-pdf-generation="2"]')).toHaveAttribute(
        'aria-hidden',
        'false'
      )
    )
    expect(usePdfStore.getState().currentPage).toBe(5)
    expect(usePdfStore.getState().zoomLevel).toBe(135)
    expect(preview.scrollTop).toBe(6_400)
  })

  it('restores independent page and scroll positions when compiled documents change', async () => {
    vi.mocked(window.api.readCompiledPdf)
      .mockResolvedValueOnce({ data: new Uint8Array([1]), mimeType: 'application/pdf' })
      .mockResolvedValueOnce({ data: new Uint8Array([2]), mimeType: 'application/pdf' })
      .mockResolvedValueOnce({ data: new Uint8Array([3]), mimeType: 'application/pdf' })
    useProjectStore.getState().setProjectRoot('/project')
    const { container } = render(<PreviewPane />)
    const preview = container.querySelector('.preview-container') as HTMLDivElement

    act(() =>
      useCompileStore.getState().setPdfPath('/project/a.pdf', {
        documentId: '/project/a.tex',
        revision: 1
      })
    )
    await screen.findByTestId('render-1-1')
    preview.scrollTop = 4_600
    fireEvent.scroll(preview)
    await waitFor(() => expect(usePdfStore.getState().currentPage).toBe(5))

    act(() =>
      useCompileStore.getState().setPdfPath('/project/b.pdf', {
        documentId: '/project/b.tex',
        revision: 1
      })
    )
    fireEvent.click(await screen.findByTestId('render-2-1'))
    await waitFor(() => expect(usePdfStore.getState().currentPage).toBe(1))
    preview.scrollTop = 1_200
    fireEvent.scroll(preview)
    await waitFor(() => expect(usePdfStore.getState().currentPage).toBe(2))

    act(() =>
      useCompileStore.getState().setPdfPath('/project/a.pdf', {
        documentId: '/project/a.tex',
        revision: 2
      })
    )
    fireEvent.click(await screen.findByTestId('render-3-5'))

    await waitFor(() => expect(usePdfStore.getState().currentPage).toBe(5))
    await waitFor(() => expect(preview.scrollTop).toBe(4_600))
  })
})

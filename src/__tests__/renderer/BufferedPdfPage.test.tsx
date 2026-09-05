import type { ReactNode, Ref } from 'react'
import type { PDFPageProxy } from 'pdfjs-dist'
import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BufferedPdfPage from '../../renderer/components/BufferedPdfPage'

const renders = vi.hoisted(() => new Map<number | undefined, () => void>())

vi.mock('react-pdf', () => ({
  Page: ({
    width,
    canvasRef,
    children,
    onRenderSuccess
  }: {
    width: number | undefined
    canvasRef: Ref<HTMLCanvasElement>
    children: ReactNode
    onRenderSuccess: (page: PDFPageProxy) => void
  }) => {
    renders.set(width, () => onRenderSuccess({} as PDFPageProxy))
    return (
      <div>
        {/* Match react-pdf: every new scale mounts a fresh canvas. */}
        <canvas key={width} ref={canvasRef} width={(width ?? 600) * 2} height={1600} />
        {children}
      </div>
    )
  }
}))

afterEach(() => {
  vi.restoreAllMocks()
  renders.clear()
})

describe('BufferedPdfPage', () => {
  it('keeps a complete bitmap visible during zoom, resize, and failed rendering', () => {
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage
    } as unknown as CanvasRenderingContext2D)
    const onRenderSuccess = vi.fn()
    const page = (width: number) => (
      <BufferedPdfPage
        pageNumber={1}
        width={width}
        renderTextLayer
        renderAnnotationLayer
        onRenderSuccess={onRenderSuccess}
      />
    )
    const { container, rerender } = render(page(600))
    const buffer = container.querySelector('.preview-page-buffer') as HTMLCanvasElement
    expect(buffer).toHaveStyle({ display: 'none' })
    const firstCanvas = container.querySelector('canvas')
    act(() => renders.get(600)!())
    expect(drawImage).toHaveBeenLastCalledWith(firstCanvas, 0, 0, 1200, 1600)
    expect(buffer).toHaveStyle({ display: 'none', width: '600px', pointerEvents: 'none' })

    rerender(page(900))
    expect(firstCanvas).not.toBeInTheDocument()
    expect(buffer).toBeInTheDocument()
    expect(buffer.width).toBe(1200)
    expect(buffer).toHaveStyle({ display: 'block', width: '900px' })
    expect(drawImage).toHaveBeenCalledTimes(1)
    const cancelledRender = renders.get(900)!

    // An intermediate render may fail or be superseded. Preserve the bitmap.
    rerender(page(450))
    act(cancelledRender)
    expect(drawImage).toHaveBeenCalledTimes(1)
    expect(onRenderSuccess).toHaveBeenCalledTimes(1)
    expect(buffer).toHaveStyle({ display: 'block', width: '450px' })
    act(() => renders.get(450)!())
    expect(buffer.width).toBe(900)
    expect(drawImage).toHaveBeenCalledTimes(2)

    // Returning to an earlier width still rejects that width's old request.
    rerender(page(900))
    act(cancelledRender)
    expect(drawImage).toHaveBeenCalledTimes(2)
    act(() => renders.get(900)!())
    expect(buffer.width * buffer.height).toBeLessThanOrEqual(2_000_000)
    expect(buffer).toHaveStyle({ display: 'none' })
    expect(drawImage).toHaveBeenCalledTimes(3)
  })

  it('starts without the previous document bitmap when the generation changes', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn()
    } as unknown as CanvasRenderingContext2D)
    const page = (generation: number) => (
      <BufferedPdfPage
        key={generation}
        pageNumber={1}
        width={600}
        renderTextLayer
        renderAnnotationLayer
        onRenderSuccess={vi.fn()}
      />
    )
    const { container, rerender } = render(page(1))
    act(() => renders.get(600)!())
    const previousBuffer = container.querySelector('.preview-page-buffer') as HTMLCanvasElement
    expect(previousBuffer.width).toBe(1200)
    rerender(page(2))
    expect(previousBuffer).not.toBeInTheDocument()
    expect(previousBuffer.width).toBe(0)
    expect(previousBuffer.height).toBe(0)
    expect(container.querySelector('.preview-page-buffer')).toHaveStyle({ display: 'none' })
  })
})

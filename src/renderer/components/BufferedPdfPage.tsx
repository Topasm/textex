import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Page } from 'react-pdf'
import type { PDFPageProxy } from 'pdfjs-dist'

interface BufferedPdfPageProps {
  pageNumber: number
  width: number | undefined
  renderTextLayer: boolean
  renderAnnotationLayer: boolean
  onRenderSuccess: (page: PDFPageProxy) => void
}

// At most 8 MB of RGBA pixels per mounted page, independent of zoom and DPR.
const MAX_BUFFER_PIXELS = 2_000_000

/** Mount separately for each document generation and page, as PreviewPane does. */
export default function BufferedPdfPage({
  width,
  onRenderSuccess,
  ...props
}: BufferedPdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bufferRef = useRef<HTMLCanvasElement>(null)
  const [completed, setCompleted] = useState<{ request: object; width: number } | null>(null)
  const request = useMemo(() => ({ width }), [width])
  const requestRef = useRef(request)
  useLayoutEffect(() => {
    requestRef.current = request
  }, [request])
  const setBufferRef = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas && bufferRef.current) {
      bufferRef.current.width = 0
      bufferRef.current.height = 0
    }
    bufferRef.current = canvas
  }, [])

  return (
    <Page
      {...props}
      className="preview-buffered-page"
      width={width}
      canvasRef={canvasRef}
      onRenderSuccess={(page) => {
        // A cancelled zoom must never replace the last complete bitmap.
        if (requestRef.current !== request) return
        const canvas = canvasRef.current
        const buffer = bufferRef.current
        if (canvas && buffer && canvas.width > 0 && canvas.height > 0) {
          const context = buffer.getContext('2d')
          if (context) {
            const scale = Math.min(1, Math.sqrt(MAX_BUFFER_PIXELS / (canvas.width * canvas.height)))
            buffer.width = Math.max(1, Math.floor(canvas.width * scale))
            buffer.height = Math.max(1, Math.floor(canvas.height * scale))
            context.drawImage(canvas, 0, 0, buffer.width, buffer.height)
            setCompleted({ request, width: width ?? page.getViewport({ scale: 1 }).width })
          }
        }
        onRenderSuccess(page)
      }}
    >
      {/* react-pdf replaces its canvas on zoom. Keep the last complete bitmap
          above it until the new canvas finishes, below text and link layers. */}
      <canvas
        ref={setBufferRef}
        aria-hidden="true"
        className="preview-page-buffer"
        style={{
          display: completed && completed.request !== request ? 'block' : 'none',
          position: 'absolute',
          top: 0,
          left: 0,
          width: width ?? completed?.width,
          height: 'auto',
          pointerEvents: 'none'
        }}
      />
    </Page>
  )
}

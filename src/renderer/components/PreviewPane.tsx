import { useMemo, useRef, useCallback, useState, useEffect } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { useAppStore } from '../store/useAppStore'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

function PreviewPane(): JSX.Element {
  const pdfBase64 = useAppStore((s) => s.pdfBase64)
  const compileStatus = useAppStore((s) => s.compileStatus)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollPositionRef = useRef(0)
  const [numPages, setNumPages] = useState(0)
  const [containerWidth, setContainerWidth] = useState<number | null>(null)

  // Measure container width on mount and resize
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Track scroll position continuously
  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      scrollPositionRef.current = containerRef.current.scrollTop
    }
  }, [])

  const pdfData = useMemo(() => {
    if (!pdfBase64) return null
    const binaryString = atob(pdfBase64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return { data: bytes }
  }, [pdfBase64])

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    // Restore scroll position after new PDF renders
    requestAnimationFrame(() => {
      if (containerRef.current) {
        containerRef.current.scrollTop = scrollPositionRef.current
      }
    })
  }, [])

  // Show empty/error states only when there is no PDF data at all
  if (compileStatus === 'error' && !pdfBase64) {
    return (
      <div className="preview-center preview-error">
        <p>Compilation failed. Check the log panel.</p>
      </div>
    )
  }

  if (!pdfData) {
    return (
      <div className="preview-center preview-empty">
        <div>
          <p>No PDF to display</p>
          <p>Open a .tex file and compile to see the preview</p>
        </div>
      </div>
    )
  }

  const pageWidth = containerWidth ? containerWidth - 32 : undefined

  return (
    <div ref={containerRef} className="preview-container" onScroll={handleScroll}>
      {compileStatus === 'compiling' && (
        <div className="preview-compiling-overlay">
          <div className="preview-spinner" />
        </div>
      )}
      <Document file={pdfData} onLoadSuccess={onDocumentLoadSuccess}>
        {Array.from({ length: numPages }, (_, i) => (
          <Page
            key={`page_${i + 1}`}
            pageNumber={i + 1}
            width={pageWidth}
          />
        ))}
      </Document>
    </div>
  )
}

export default PreviewPane

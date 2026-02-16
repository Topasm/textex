import { useMemo, useRef, useCallback, useState, useEffect } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { useAppStore } from '../store/useAppStore'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

interface PageViewportInfo {
  viewport: { convertToViewportPoint(x: number, y: number): [number, number] }
  element: HTMLDivElement
}

function PreviewPane(): JSX.Element {
  const pdfBase64 = useAppStore((s) => s.pdfBase64)
  const compileStatus = useAppStore((s) => s.compileStatus)
  const synctexHighlight = useAppStore((s) => s.synctexHighlight)
  const zoomLevel = useAppStore((s) => s.zoomLevel)
  const zoomIn = useAppStore((s) => s.zoomIn)
  const zoomOut = useAppStore((s) => s.zoomOut)
  const resetZoom = useAppStore((s) => s.resetZoom)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollPositionRef = useRef(0)
  const [numPages, setNumPages] = useState(0)
  const [containerWidth, setContainerWidth] = useState<number | null>(null)
  const [ctrlHeld, setCtrlHeld] = useState(false)
  const pageViewportsRef = useRef<Map<number, PageViewportInfo>>(new Map())
  const [highlightStyle, setHighlightStyle] = useState<React.CSSProperties | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)

  // Track Ctrl key for crosshair cursor
  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey) setCtrlHeld(true)
    }
    const up = (e: KeyboardEvent): void => {
      if (!e.ctrlKey && !e.metaKey) setCtrlHeld(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

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
      bytes[i] = binaryString.charCodeAt(i) & 0xFF
    }
    return { data: bytes }
  }, [pdfBase64])

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setPdfError(null)
    pageViewportsRef.current.clear()
    // Restore scroll position after new PDF renders
    requestAnimationFrame(() => {
      if (containerRef.current) {
        containerRef.current.scrollTop = scrollPositionRef.current
      }
    })
  }, [])

  const onDocumentLoadError = useCallback((error: Error) => {
    setPdfError(error.message || 'Unknown PDF loading error')
    useAppStore.getState().appendLog(`PDF viewer error: ${error.message}\n`)
    useAppStore.getState().setLogPanelOpen(true)
  }, [])

  // Capture viewport info when each page renders
  const handlePageRenderSuccess = useCallback(
    (pageNumber: number) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (page: any) => {
        const container = containerRef.current
        if (!container) return
        const pageEl = container.querySelector(
          `[data-page-number="${pageNumber}"]`
        ) as HTMLDivElement | null
        if (!pageEl) return
        // Calculate the actual scale from the rendered page (including zoom)
        const pw = containerWidth ? (containerWidth - 32) * (zoomLevel / 100) : 612
        const defaultWidth = 612 // default PDF point width for letter
        const scale = pw / defaultWidth
        const viewport = page.getViewport({ scale })
        pageViewportsRef.current.set(pageNumber, { viewport, element: pageEl })
      }
    },
    [containerWidth, zoomLevel]
  )

  // React to synctexHighlight changes — show indicator + scroll
  useEffect(() => {
    if (!synctexHighlight) {
      setHighlightStyle(null)
      return
    }

    const { page, x, y } = synctexHighlight
    const info = pageViewportsRef.current.get(page)
    if (!info) {
      // Page viewport not captured yet — try scrolling to page first
      const container = containerRef.current
      if (container) {
        const pageEl = container.querySelector(
          `[data-page-number="${page}"]`
        ) as HTMLDivElement | null
        if (pageEl) {
          pageEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }
      setHighlightStyle(null)
      return
    }

    const { viewport, element } = info
    const [vx, vy] = viewport.convertToViewportPoint(x, y)

    // Scroll the page into view
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })

    // Calculate position relative to the container
    const containerRect = containerRef.current?.getBoundingClientRect()
    const pageRect = element.getBoundingClientRect()
    if (!containerRect) return

    setHighlightStyle({
      position: 'absolute',
      left: pageRect.left - containerRect.left + (containerRef.current?.scrollLeft ?? 0) + vx,
      top: pageRect.top - containerRect.top + (containerRef.current?.scrollTop ?? 0) + vy,
      width: 30,
      height: 30
    })

    // Clear highlight after animation
    const timer = setTimeout(() => {
      setHighlightStyle(null)
      useAppStore.getState().setSynctexHighlight(null)
    }, 1500)
    return () => clearTimeout(timer)
  }, [synctexHighlight])

  // Ctrl+Click inverse SyncTeX handler
  const handleContainerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!(e.ctrlKey || e.metaKey)) return

      const filePath = useAppStore.getState().filePath
      if (!filePath) return

      const container = containerRef.current
      if (!container) return

      // Find which page was clicked
      let targetPageNumber: number | null = null
      let targetPageEl: HTMLDivElement | null = null

      for (const [pageNum, info] of pageViewportsRef.current) {
        const rect = info.element.getBoundingClientRect()
        if (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        ) {
          targetPageNumber = pageNum
          targetPageEl = info.element
          break
        }
      }

      if (targetPageNumber === null || targetPageEl === null) return

      const info = pageViewportsRef.current.get(targetPageNumber)
      if (!info) return

      // Get click position relative to the page element
      const pageRect = targetPageEl.getBoundingClientRect()
      const clickX = e.clientX - pageRect.left
      const clickY = e.clientY - pageRect.top

      // Convert screen coordinates to PDF coordinates
      // We need to reverse the viewport transformation (including zoom)
      const pw = containerWidth
        ? (containerWidth - 32) * (useAppStore.getState().zoomLevel / 100)
        : 612
      const defaultWidth = 612
      const scale = pw / defaultWidth
      const pdfX = clickX / scale
      const pdfY = clickY / scale

      window.api.synctexInverse(filePath, targetPageNumber, pdfX, pdfY).then((result) => {
        if (result) {
          useAppStore.getState().requestJumpToLine(result.line, result.column || 1)
        }
      })
    },
    [containerWidth]
  )

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

  const pageWidth = containerWidth ? (containerWidth - 32) * (zoomLevel / 100) : undefined

  return (
    <div
      ref={containerRef}
      className={`preview-container${ctrlHeld ? ' preview-synctex-cursor' : ''}`}
      onScroll={handleScroll}
      onClick={handleContainerClick}
      style={{ position: 'relative' }}
    >
      <div className="zoom-toolbar">
        <button onClick={zoomOut} disabled={zoomLevel <= 25} title="Zoom Out">
          -
        </button>
        <span>{zoomLevel}%</span>
        <button onClick={zoomIn} disabled={zoomLevel >= 400} title="Zoom In">
          +
        </button>
        <button onClick={resetZoom} title="Fit Width">
          Fit Width
        </button>
      </div>
      {compileStatus === 'compiling' && (
        <div className="preview-compiling-overlay">
          <div className="preview-spinner" />
        </div>
      )}
      <Document file={pdfData} onLoadSuccess={onDocumentLoadSuccess} onLoadError={onDocumentLoadError}>
        {Array.from({ length: numPages }, (_, i) => (
          <Page
            key={`page_${i + 1}`}
            pageNumber={i + 1}
            width={pageWidth}
            onRenderSuccess={handlePageRenderSuccess(i + 1)}
          />
        ))}
      </Document>
      {pdfError && (
        <div className="preview-center preview-error" style={{ position: 'absolute', top: 40, left: 0, right: 0 }}>
          <p>Failed to load PDF: {pdfError}</p>
          <p>Check the log panel for details.</p>
        </div>
      )}
      {highlightStyle && <div className="synctex-indicator" style={highlightStyle} />}
    </div>
  )
}

export default PreviewPane

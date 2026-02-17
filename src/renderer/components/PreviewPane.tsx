import { useMemo, useRef, useCallback, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { useAppStore } from '../store/useAppStore'
import PdfSearchBar from './PdfSearchBar'
import { usePreviewZoom } from '../hooks/preview/usePreviewZoom'
import { useSynctex } from '../hooks/preview/useSynctex'
import { usePdfSearch } from '../hooks/preview/usePdfSearch'
import { useContainerSize } from '../hooks/preview/useContainerSize'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Use ?url import for reliable URL resolution in Vite/Electron
// The new URL() pattern can fail for node_modules dependencies
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

interface PageViewportInfo {
  viewport: { convertToViewportPoint(x: number, y: number): [number, number]; viewBox: number[] }
  element: HTMLDivElement
  pageWidth: number  // actual PDF page width in points
  pageHeight: number // actual PDF page height in points
}

function PreviewPane() {
  const pdfBase64 = useAppStore((s) => s.pdfBase64)
  const compileStatus = useAppStore((s) => s.compileStatus)
  const zoomLevel = useAppStore((s) => s.zoomLevel)
  const pdfInvertMode = useAppStore((s) => s.settings.pdfInvertMode)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollPositionRef = useRef(0)
  const [numPages, setNumPages] = useState(0)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const pageViewportsRef = useRef<Map<number, PageViewportInfo>>(new Map())

  // Extracted hooks
  const { containerWidth, ctrlHeld } = useContainerSize(containerRef)
  const { transientScale } = usePreviewZoom(containerRef)
  const { highlightStyle, handleContainerClick } = useSynctex(containerRef, pageViewportsRef, containerWidth)
  const {
    searchVisible,
    searchMatches,
    currentMatchIndex,
    handleSearchNext,
    handleSearchPrev,
    handleSearchClose,
    setSearchQuery,
  } = usePdfSearch(containerRef, numPages)

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
    const msg = error.message || 'Unknown PDF loading error'
    console.error('PDF load error:', msg, error)
    setPdfError(msg)
    useAppStore.getState().appendLog(`PDF viewer error: ${msg}\n`)
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
        // Get actual page dimensions from PDF.js (handles A4, Letter, etc.)
        const baseViewport = page.getViewport({ scale: 1 })
        const actualPageWidth = baseViewport.width
        const actualPageHeight = baseViewport.height
        const pw = containerWidth ? (containerWidth - 32) * (zoomLevel / 100) : actualPageWidth
        const scale = pw / actualPageWidth
        const viewport = page.getViewport({ scale })
        pageViewportsRef.current.set(pageNumber, {
          viewport,
          element: pageEl,
          pageWidth: actualPageWidth,
          pageHeight: actualPageHeight,
        })
      }
    },
    [containerWidth, zoomLevel]
  )

  const pageWidth = containerWidth ? (containerWidth - 32) * (zoomLevel / 100) : undefined

  // Always render the container so the ResizeObserver can attach and measure width.
  // Conditional content is rendered inside it.
  return (
    <div
      ref={containerRef}
      className={`preview-container${ctrlHeld ? ' preview-synctex-cursor' : ''}${pdfInvertMode ? ' preview-invert' : ''}`}
      onScroll={handleScroll}
      onClick={handleContainerClick}
      style={{ position: 'relative' }}
    >
      {compileStatus === 'error' && !pdfBase64 ? (
        <div className="preview-center preview-error">
          <p>Compilation failed. Check the log panel.</p>
        </div>
      ) : !pdfData ? (
        <div className="preview-center preview-empty">
          <div>
            <p>No PDF to display</p>
            <p>Open a .tex file and compile to see the preview</p>
          </div>
        </div>
      ) : (
        <>
          <PdfSearchBar
            visible={searchVisible}
            onClose={handleSearchClose}
            onSearch={setSearchQuery}
            onNext={handleSearchNext}
            onPrev={handleSearchPrev}
            matchCount={searchMatches.length}
            currentMatch={currentMatchIndex}
          />
          {compileStatus === 'compiling' && (
            <div className="preview-compiling-overlay">
              <div className="preview-spinner" />
            </div>
          )}
          <div
            style={
              transientScale != null
                ? {
                  transform: `scale(${transientScale})`,
                  transformOrigin: 'top center',
                  willChange: 'transform'
                }
                : undefined
            }
          >
            <Document
              file={pdfData}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <div className="preview-center">
                  <div>
                    <div className="preview-spinner" />
                    <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading PDF...</p>
                  </div>
                </div>
              }
            >
              {Array.from({ length: numPages }, (_, i) => (
                <Page
                  key={`page_${i + 1}`}
                  pageNumber={i + 1}
                  width={pageWidth}
                  onRenderSuccess={handlePageRenderSuccess(i + 1)}
                />
              ))}
            </Document>
          </div>
          {pdfError && (
            <div className="preview-center preview-error" style={{ position: 'absolute', top: 40, left: 0, right: 0 }}>
              <p>Failed to load PDF: {pdfError}</p>
              <p>Check the log panel for details.</p>
            </div>
          )}
          {highlightStyle && <div className="synctex-indicator" style={highlightStyle} />}
        </>
      )}
    </div>
  )
}

export default PreviewPane

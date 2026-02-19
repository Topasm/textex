import { useMemo, useRef, useCallback, useState, useEffect } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { useAppStore } from '../store/useAppStore'
import PdfSearchBar from './PdfSearchBar'
import { usePreviewZoom } from '../hooks/preview/usePreviewZoom'
import { useSynctex } from '../hooks/preview/useSynctex'
import { usePdfSearch } from '../hooks/preview/usePdfSearch'
import { useCitationTooltip } from '../hooks/preview/useCitationTooltip'
import { useContainerSize } from '../hooks/preview/useContainerSize'
import CitationTooltip from './CitationTooltip'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Use ?url import for reliable URL resolution in Vite/Electron
// The new URL() pattern can fail for node_modules dependencies
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

interface PageViewportInfo {
  viewport: { convertToViewportPoint(x: number, y: number): [number, number]; viewBox: number[] }
  element: HTMLDivElement
  pageWidth: number // actual PDF page width in points
  pageHeight: number // actual PDF page height in points
}

/** Number of pages to render beyond the visible viewport in each direction. */
const PAGE_OVERSCAN = 2
/** Estimated page height in pixels when actual height is unknown. */
const ESTIMATED_PAGE_HEIGHT = 1100
/** Debounce scroll events to reduce visible-page recalculation frequency. */
const SCROLL_DEBOUNCE_MS = 100

function PreviewPane() {
  const pdfPath = useAppStore((s) => s.pdfPath)
  const pdfRevision = useAppStore((s) => s.pdfRevision)
  const compileStatus = useAppStore((s) => s.compileStatus)
  const zoomLevel = useAppStore((s) => s.zoomLevel)
  const pdfInvertMode = useAppStore((s) => s.settings.pdfInvertMode)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollPositionRef = useRef(0)
  const [numPages, setNumPages] = useState(0)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const pageViewportsRef = useRef<Map<number, PageViewportInfo>>(new Map())

  // Virtual scrolling: track which pages are visible
  const [visibleRange, setVisibleRange] = useState<{ start: number; end: number }>({ start: 1, end: 5 })
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Cache of rendered page heights for accurate positioning
  const pageHeightsRef = useRef<Map<number, number>>(new Map())

  // Extracted hooks
  const { containerWidth, ctrlHeld } = useContainerSize(containerRef)
  const { transientScale } = usePreviewZoom(containerRef)
  const { highlightStyle, handleContainerClick } = useSynctex(
    containerRef,
    pageViewportsRef,
    containerWidth
  )
  const {
    searchVisible,
    searchMatches,
    currentMatchIndex,
    handleSearchNext,
    handleSearchPrev,
    handleSearchClose,
    setSearchQuery
  } = usePdfSearch(containerRef, numPages)
  const { tooltipData } = useCitationTooltip(containerRef, pdfRevision)

  /** Calculate estimated height for a page. */
  const getPageHeight = useCallback(
    (pageNum: number): number => {
      const cached = pageHeightsRef.current.get(pageNum)
      if (cached) return cached
      // Estimate based on A4 aspect ratio and current page width
      const pw = containerWidth ? (containerWidth - 32) * (zoomLevel / 100) : 595
      return pw * (842 / 595) // A4 aspect ratio
    },
    [containerWidth, zoomLevel]
  )

  /** Compute which pages are currently in the viewport. */
  const computeVisiblePages = useCallback(() => {
    const container = containerRef.current
    if (!container || numPages === 0) return

    const scrollTop = container.scrollTop
    const viewportHeight = container.clientHeight

    let cumHeight = 0
    let startPage = 1
    let endPage = numPages

    // Find first visible page
    for (let i = 1; i <= numPages; i++) {
      const ph = getPageHeight(i) + 16 // 16px gap between pages
      if (cumHeight + ph > scrollTop) {
        startPage = i
        break
      }
      cumHeight += ph
    }

    // Find last visible page
    cumHeight = 0
    for (let i = 1; i <= numPages; i++) {
      cumHeight += getPageHeight(i) + 16
      if (cumHeight >= scrollTop + viewportHeight) {
        endPage = i
        break
      }
    }

    // Add overscan
    const start = Math.max(1, startPage - PAGE_OVERSCAN)
    const end = Math.min(numPages, endPage + PAGE_OVERSCAN)

    setVisibleRange((prev) => {
      if (prev.start === start && prev.end === end) return prev
      return { start, end }
    })
  }, [numPages, getPageHeight])

  // Track scroll position and update visible pages with debouncing
  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      scrollPositionRef.current = containerRef.current.scrollTop
    }

    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
    scrollTimerRef.current = setTimeout(computeVisiblePages, SCROLL_DEBOUNCE_MS)
  }, [computeVisiblePages])

  // Recalculate visible pages when zoom or page count changes
  useEffect(() => {
    computeVisiblePages()
  }, [computeVisiblePages, zoomLevel])

  // Cleanup scroll timer
  useEffect(() => {
    return () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
    }
  }, [])

  // Use file URL with revision query param to force react-pdf to reload on recompile.
  // This avoids the expensive base64 encode → IPC transfer → decode pipeline.
  const pdfFileUrl = useMemo(() => {
    if (!pdfPath) return null
    return `file://${pdfPath}?v=${pdfRevision}`
  }, [pdfPath, pdfRevision])

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setPdfError(null)
    pageViewportsRef.current.clear()
    pageHeightsRef.current.clear()
    setVisibleRange({ start: 1, end: Math.min(numPages, 5) })
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
          pageHeight: actualPageHeight
        })
        // Cache the rendered height for virtual scrolling calculations
        pageHeightsRef.current.set(pageNumber, actualPageHeight * scale)
      }
    },
    [containerWidth, zoomLevel]
  )

  const pageWidth = containerWidth ? (containerWidth - 32) * (zoomLevel / 100) : undefined

  // Calculate total content height and page offsets for virtual scrolling placeholder
  const { totalHeight, pageOffsets } = useMemo(() => {
    const offsets = new Map<number, number>()
    let total = 0
    for (let i = 1; i <= numPages; i++) {
      offsets.set(i, total)
      const ph = pageHeightsRef.current.get(i) ?? (pageWidth ? pageWidth * (842 / 595) : ESTIMATED_PAGE_HEIGHT)
      total += ph + 16 // 16px gap between pages
    }
    return { totalHeight: total, pageOffsets: offsets }
  }, [numPages, pageWidth])

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
      {compileStatus === 'error' && !pdfFileUrl ? (
        <div className="preview-center preview-error">
          <p>Compilation failed. Check the log panel.</p>
        </div>
      ) : !pdfFileUrl ? (
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
              file={pdfFileUrl}
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
              {/* Virtual scrolling: use a container with total height and only render visible pages */}
              {numPages <= 10 ? (
                // For small documents, render all pages (no virtualization overhead)
                Array.from({ length: numPages }, (_, i) => (
                  <Page
                    key={`page_${i + 1}`}
                    pageNumber={i + 1}
                    width={pageWidth}
                    onRenderSuccess={handlePageRenderSuccess(i + 1)}
                  />
                ))
              ) : (
                <div style={{ height: totalHeight, position: 'relative' }}>
                  {Array.from({ length: numPages }, (_, i) => {
                    const pageNum = i + 1
                    const isVisible = pageNum >= visibleRange.start && pageNum <= visibleRange.end
                    const offset = pageOffsets.get(pageNum) ?? 0
                    const estimatedHeight =
                      pageHeightsRef.current.get(pageNum) ??
                      (pageWidth ? pageWidth * (842 / 595) : ESTIMATED_PAGE_HEIGHT)

                    if (!isVisible) {
                      // Placeholder for non-visible pages to maintain scroll position
                      return (
                        <div
                          key={`page_placeholder_${pageNum}`}
                          style={{
                            position: 'absolute',
                            top: offset,
                            left: 0,
                            right: 0,
                            height: estimatedHeight
                          }}
                          data-page-number={pageNum}
                        />
                      )
                    }

                    return (
                      <div
                        key={`page_${pageNum}`}
                        style={{
                          position: 'absolute',
                          top: offset,
                          left: 0,
                          right: 0
                        }}
                      >
                        <Page
                          pageNumber={pageNum}
                          width={pageWidth}
                          onRenderSuccess={handlePageRenderSuccess(pageNum)}
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </Document>
          </div>
          {pdfError && (
            <div
              className="preview-center preview-error"
              style={{ position: 'absolute', top: 40, left: 0, right: 0 }}
            >
              <p>Failed to load PDF: {pdfError}</p>
              <p>Check the log panel for details.</p>
            </div>
          )}
          {highlightStyle && <div className="synctex-indicator" style={highlightStyle} />}
          {tooltipData && (
            <CitationTooltip
              entries={tooltipData.entries}
              x={tooltipData.x}
              y={tooltipData.y}
              containerRect={tooltipData.containerRect}
            />
          )}
        </>
      )}
    </div>
  )
}

export default PreviewPane

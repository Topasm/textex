import { useMemo, useRef, useCallback, useState, useEffect } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { useCompileStore } from '../store/useCompileStore'
import { usePdfStore } from '../store/usePdfStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { useProjectStore } from '../store/useProjectStore'
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
/** Debounce delay for persisting scroll position. */
const SCROLL_PERSIST_DEBOUNCE_MS = 500
/** Accumulated horizontal delta threshold to trigger page navigation in single-page mode. */
const SWIPE_THRESHOLD = 150
/** Cooldown between swipe-triggered page navigations. */
const SWIPE_COOLDOWN_MS = 300

function PreviewPane() {
  const pdfPath = useCompileStore((s) => s.pdfPath)
  const pdfRevision = useCompileStore((s) => s.pdfRevision)
  const compileStatus = useCompileStore((s) => s.compileStatus)
  const zoomLevel = usePdfStore((s) => s.zoomLevel)
  const fitRequest = usePdfStore((s) => s.fitRequest)
  const pdfInvertMode = useSettingsStore((s) => s.settings.pdfInvertMode)
  const pdfViewMode = useSettingsStore((s) => s.settings.pdfViewMode ?? 'continuous')
  const currentPage = usePdfStore((s) => s.currentPage)
  const projectRoot = useProjectStore((s) => s.projectRoot)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollPositionRef = useRef(0)
  const [numPages, setNumPages] = useState(0)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const pageViewportsRef = useRef<Map<number, PageViewportInfo>>(new Map())

  // Virtual scrolling: track which pages are visible
  const [visibleRange, setVisibleRange] = useState<{ start: number; end: number }>({ start: 1, end: 5 })
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Cache of rendered page heights for accurate positioning
  const pageHeightsRef = useRef<Map<number, number>>(new Map())

  // Extracted hooks
  const { containerWidth, ctrlHeld } = useContainerSize(containerRef)
  const { transientScale } = usePreviewZoom(containerRef)
  const { highlights, handleContainerClick } = useSynctex(
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

    // Update current page in store
    usePdfStore.getState().setCurrentPage(startPage)

    // Add overscan
    const start = Math.max(1, startPage - PAGE_OVERSCAN)
    const end = Math.min(numPages, endPage + PAGE_OVERSCAN)

    setVisibleRange((prev) => {
      if (prev.start === start && prev.end === end) return prev
      return { start, end }
    })
  }, [numPages, getPageHeight])

  // scrollToPage: scroll the container so the given page is at the top
  const scrollToPage = useCallback(
    (page: number) => {
      const container = containerRef.current
      if (!container || numPages === 0) return
      const clamped = Math.max(1, Math.min(numPages, page))

      if (pdfViewMode === 'single') {
        usePdfStore.getState().setCurrentPage(clamped)
        return
      }

      let offset = 0
      for (let i = 1; i < clamped; i++) {
        offset += getPageHeight(i) + 16
      }
      container.scrollTop = offset
    },
    [numPages, getPageHeight, pdfViewMode]
  )

  // Expose scrollToPage to the store so Toolbar can call it
  useEffect(() => {
    usePdfStore.getState().setScrollToPage(scrollToPage)
    return () => {
      usePdfStore.getState().setScrollToPage(null)
    }
  }, [scrollToPage])

  // Sync numPages to store
  useEffect(() => {
    usePdfStore.getState().setNumPages(numPages)
  }, [numPages])

  // Handle fitRequest from store
  useEffect(() => {
    if (!fitRequest) return
    const container = containerRef.current
    if (!container) {
      usePdfStore.getState().clearFitRequest()
      return
    }

    if (fitRequest === 'width') {
      // 100% zoom = page fills container width (minus padding)
      usePdfStore.getState().setZoomLevel(100)
    } else if (fitRequest === 'height') {
      // Compute zoom so one full page fits vertically
      const containerHeight = container.clientHeight
      const cw = containerWidth || container.clientWidth
      // Use first page dimensions if available, else A4
      const firstPage = pageViewportsRef.current.get(1)
      const pageW = firstPage?.pageWidth ?? 595
      const pageH = firstPage?.pageHeight ?? 842
      // At zoom Z%, page rendered width = (cw - 32) * Z/100
      // Rendered height = pageH * ((cw - 32) * Z/100) / pageW
      // We want rendered height = containerHeight
      // => Z = (containerHeight * pageW) / (pageH * (cw - 32)) * 100
      const zoom = Math.round((containerHeight * pageW) / (pageH * (cw - 32)) * 100)
      usePdfStore.getState().setZoomLevel(zoom)
    }
    usePdfStore.getState().clearFitRequest()
  }, [fitRequest, containerWidth])

  // Track scroll position and update visible pages with debouncing
  const handleScroll = useCallback(() => {
    if (pdfViewMode === 'single') return

    if (containerRef.current) {
      scrollPositionRef.current = containerRef.current.scrollTop
    }

    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
    scrollTimerRef.current = setTimeout(computeVisiblePages, SCROLL_DEBOUNCE_MS)

    // Debounced persist of scroll position per project
    if (scrollPersistTimerRef.current) clearTimeout(scrollPersistTimerRef.current)
    scrollPersistTimerRef.current = setTimeout(() => {
      if (projectRoot && containerRef.current) {
        usePdfStore.getState().saveScrollPosition(projectRoot, containerRef.current.scrollTop)
      }
    }, SCROLL_PERSIST_DEBOUNCE_MS)
  }, [computeVisiblePages, projectRoot, pdfViewMode])

  // Horizontal scroll / swipe navigation
  // In continuous mode: horizontal scroll support for mice with horizontal wheels.
  // In single-page mode: accumulate deltaX/deltaY for page navigation.
  const swipeAccumRef = useRef(0)
  const swipeCooldownRef = useRef(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handler = (e: WheelEvent): void => {
      if (e.ctrlKey || e.metaKey) return

      if (pdfViewMode === 'single') {
        // In single-page mode, accumulate delta for swipe navigation
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
        if (delta === 0) return
        e.preventDefault()

        if (swipeCooldownRef.current) return

        swipeAccumRef.current += delta
        if (Math.abs(swipeAccumRef.current) >= SWIPE_THRESHOLD) {
          const { currentPage: cp, numPages: np } = usePdfStore.getState()
          if (swipeAccumRef.current > 0 && cp < np) {
            usePdfStore.getState().setCurrentPage(cp + 1)
          } else if (swipeAccumRef.current < 0 && cp > 1) {
            usePdfStore.getState().setCurrentPage(cp - 1)
          }
          swipeAccumRef.current = 0
          swipeCooldownRef.current = true
          setTimeout(() => { swipeCooldownRef.current = false }, SWIPE_COOLDOWN_MS)
        }
        return
      }

      // Continuous mode: Shift + vertical wheel → horizontal scroll
      if (e.shiftKey && e.deltaY !== 0) {
        el.scrollLeft += e.deltaY
        e.preventDefault()
        return
      }

      // Horizontal wheel (e.g. MX Master thumb wheel)
      if (e.deltaX !== 0) {
        el.scrollLeft += e.deltaX
        if (e.deltaY === 0) e.preventDefault()
      }
    }

    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [pdfViewMode])

  // Keyboard shortcuts for fit-to-width (Ctrl+0), fit-to-height (Ctrl+9),
  // and arrow key navigation in single-page mode
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '0') {
          e.preventDefault()
          usePdfStore.getState().requestFit('width')
        } else if (e.key === '9') {
          e.preventDefault()
          usePdfStore.getState().requestFit('height')
        }
        return
      }

      // Arrow key navigation in single-page mode
      if (pdfViewMode === 'single') {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return

        const { currentPage: cp, numPages: np } = usePdfStore.getState()
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          if (cp < np) {
            e.preventDefault()
            usePdfStore.getState().setCurrentPage(cp + 1)
          }
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          if (cp > 1) {
            e.preventDefault()
            usePdfStore.getState().setCurrentPage(cp - 1)
          }
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [pdfViewMode])

  // Handle view mode transitions
  useEffect(() => {
    if (numPages === 0) return
    if (pdfViewMode === 'single') {
      // Clamp currentPage to valid range
      const cp = usePdfStore.getState().currentPage
      const clamped = Math.max(1, Math.min(numPages, cp))
      if (clamped !== cp) usePdfStore.getState().setCurrentPage(clamped)
    } else {
      // Switching to continuous — scroll to the current page position
      const cp = usePdfStore.getState().currentPage
      const container = containerRef.current
      if (container && cp > 1) {
        let offset = 0
        for (let i = 1; i < cp; i++) {
          offset += getPageHeight(i) + 16
        }
        container.scrollTop = offset
      }
    }
  }, [pdfViewMode, numPages, getPageHeight])

  // Recalculate visible pages when zoom or page count changes
  useEffect(() => {
    computeVisiblePages()
  }, [computeVisiblePages, zoomLevel])

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
      if (scrollPersistTimerRef.current) clearTimeout(scrollPersistTimerRef.current)
    }
  }, [])

  // Load PDF as binary data via IPC. This works reliably in both dev mode
  // (where http://localhost can't access file:// URLs) and production.
  const [pdfData, setPdfData] = useState<{ data: Uint8Array } | null>(null)
  useEffect(() => {
    if (!pdfPath) {
      setPdfData(null)
      return
    }
    let cancelled = false
    window.api.readFileBase64(pdfPath).then((result: { data: string }) => {
      if (cancelled) return
      // result.data is a data URL: "data:<mime>;base64,<payload>"
      const base64 = result.data.split(',')[1]
      const raw = atob(base64)
      const bytes = new Uint8Array(raw.length)
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
      setPdfData({ data: bytes })
    }).catch(() => {
      if (!cancelled) setPdfData(null)
    })
    return () => { cancelled = true }
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
        // Prefer within-session ref for recompile position, then per-project persisted
        const sessionScroll = scrollPositionRef.current
        if (sessionScroll > 0) {
          containerRef.current.scrollTop = sessionScroll
        } else if (projectRoot) {
          const saved = usePdfStore.getState().getScrollPosition(projectRoot)
          if (saved > 0) {
            containerRef.current.scrollTop = saved
          }
        }
      }
    })
  }, [projectRoot])

  const onDocumentLoadError = useCallback((error: Error) => {
    const msg = error.message || 'Unknown PDF loading error'
    console.error('PDF load error:', msg, error)
    setPdfError(msg)
    useCompileStore.getState().appendLog(`PDF viewer error: ${msg}\n`)
    useCompileStore.getState().setLogPanelOpen(true)
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
      className={`preview-container${ctrlHeld ? ' preview-synctex-cursor' : ''}${pdfInvertMode ? ' preview-invert' : ''}${pdfViewMode === 'single' ? ' preview-single-mode' : ''}`}
      onScroll={handleScroll}
      onClick={handleContainerClick}
      style={{ position: 'relative' }}
    >
      {compileStatus === 'error' && !pdfData ? (
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
              {/* Virtual scrolling: use a container with total height and only render visible pages */}
              {pdfViewMode === 'single' ? (
                <div className="preview-single-page-container">
                  <Page
                    key={`single_page_${currentPage}`}
                    pageNumber={currentPage}
                    width={pageWidth}
                    onRenderSuccess={handlePageRenderSuccess(currentPage)}
                  />
                </div>
              ) : numPages <= 10 ? (
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
          {highlights.lineStyle && <div className="synctex-line-highlight" style={highlights.lineStyle} />}
          {highlights.dotStyle && <div className="synctex-indicator" style={highlights.dotStyle} />}
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

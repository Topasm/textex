import { useMemo, useRef, useCallback, useState, useEffect, useReducer } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import type { PDFPageProxy } from 'pdfjs-dist'
import { useCompileStore } from '../store/useCompileStore'
import { usePdfStore } from '../store/usePdfStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { useProjectStore } from '../store/useProjectStore'
import { usePreviewZoom } from '../hooks/preview/usePreviewZoom'
import { useSynctex } from '../hooks/preview/useSynctex'
import { useScrollSync } from '../hooks/preview/useScrollSync'
import { usePdfSearch } from '../hooks/preview/usePdfSearch'
import { useCitationTooltip } from '../hooks/preview/useCitationTooltip'
import { useContainerSize } from '../hooks/preview/useContainerSize'
import CitationTooltip from './CitationTooltip'
import { runtimePerformance } from '../services/runtimePerformance'
import {
  initialPdfGenerationState,
  reducePdfGeneration,
  type PdfGeneration
} from './previewGeneration'
import {
  SCROLL_PERSIST_DEBOUNCE_MS,
  SWIPE_THRESHOLD,
  SWIPE_THRESHOLD_HORIZONTAL,
  SWIPE_COOLDOWN_MS,
  VIRTUALIZATION_THRESHOLD,
  calcPageWidth,
  estimatePageHeight,
  buildCumulativeLayout,
  buildVirtualPageNumbers,
  binarySearchPage,
  computeVisibleRange,
  calcFitHeightZoom,
  clampPage
} from './previewUtils'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Use ?url import for reliable URL resolution in Vite/Electron
// The new URL() pattern can fail for node_modules dependencies
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

interface PageViewportInfo {
  viewport: { convertToViewportPoint(x: number, y: number): number[]; viewBox: number[] }
  element: HTMLDivElement
  pageWidth: number // actual PDF page width in points
  pageHeight: number // actual PDF page height in points
}

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
  const [pdfError, setPdfError] = useState<string | null>(null)
  const pageViewportsRef = useRef<Map<number, PageViewportInfo>>(new Map())
  const [generationState, dispatchGeneration] = useReducer(
    reducePdfGeneration,
    initialPdfGenerationState
  )
  const generationStateRef = useRef(generationState)
  generationStateRef.current = generationState
  const displayedGeneration = generationState.displayed
  const pendingGeneration = generationState.pending
  const displayedRevision = displayedGeneration?.revision ?? 0
  const numPages = displayedGeneration?.numPages ?? 0

  // Virtual scrolling: track which pages are visible
  const [visibleRange, setVisibleRange] = useState<{ start: number; end: number }>({
    start: 1,
    end: 5
  })
  const scrollFrameRef = useRef<number | null>(null)
  const scrollPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Cache intrinsic ratios rather than pixel heights so zoom/resize cannot
  // make the virtual layout stale.
  const [pageAspectRatios, setPageAspectRatios] = useState<ReadonlyMap<number, number>>(
    () => new Map()
  )

  // Extracted hooks
  const { containerWidth, ctrlHeld } = useContainerSize(containerRef)
  const { transientScale } = usePreviewZoom(containerRef)
  const { highlights, handleContainerClick } = useSynctex(containerRef, pageViewportsRef)
  useScrollSync({ containerRef, pageViewportsRef, containerWidth, pdfRevision: displayedRevision })
  // usePdfSearch handles DOM highlighting and communicates with OmniSearch via store
  usePdfSearch(containerRef, numPages)
  const { tooltipData } = useCitationTooltip(containerRef, displayedRevision)

  /** Calculate estimated height for a page. */
  const getPageHeight = useCallback(
    (pageNum: number): number => {
      return estimatePageHeight(
        containerWidth ?? undefined,
        zoomLevel,
        pageAspectRatios.get(pageNum)
      )
    },
    [containerWidth, pageAspectRatios, zoomLevel]
  )

  const pageWidth = calcPageWidth(containerWidth ?? undefined, zoomLevel)

  // Pre-compute cumulative page heights and offsets for O(log N) binary search
  const { totalHeight, pageOffsets, cumulativeHeights } = useMemo(
    () => buildCumulativeLayout(numPages, getPageHeight),
    [numPages, getPageHeight]
  )
  const virtualPageNumbers = useMemo(
    () => buildVirtualPageNumbers(visibleRange, numPages),
    [visibleRange, numPages]
  )

  /** Compute which pages are currently in the viewport using O(log N) binary search. */
  const computeVisiblePages = useCallback(() => {
    const container = containerRef.current
    if (!container || numPages === 0 || cumulativeHeights.length === 0) return

    const scrollTop = container.scrollTop
    const viewportHeight = container.clientHeight

    // Binary search for first and last visible pages
    const startPage = binarySearchPage(cumulativeHeights, scrollTop)
    const endPage = binarySearchPage(cumulativeHeights, scrollTop + viewportHeight)

    // Update current page in store
    usePdfStore.getState().setCurrentPage(startPage)

    // Add overscan
    const range = computeVisibleRange(startPage, endPage, numPages)

    setVisibleRange((prev) => {
      if (prev.start === range.start && prev.end === range.end) return prev
      return range
    })
  }, [numPages, cumulativeHeights])

  // scrollToPage: scroll the container so the given page is at the top
  const scrollToPage = useCallback(
    (page: number) => {
      const container = containerRef.current
      if (!container || numPages === 0) return
      const clamped = clampPage(page, numPages)

      if (pdfViewMode === 'single') {
        usePdfStore.getState().setCurrentPage(clamped)
        return
      }

      // Render the destination window immediately so direct navigation never
      // waits for the next scroll frame before the target page can mount.
      usePdfStore.getState().setCurrentPage(clamped)
      setVisibleRange(computeVisibleRange(clamped, clamped, numPages))

      // Direct O(1) lookup from pre-computed offsets
      container.scrollTop = pageOffsets.get(clamped) ?? 0
    },
    [numPages, pdfViewMode, pageOffsets]
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
      const zoom = calcFitHeightZoom(containerHeight, cw, pageW, pageH)
      usePdfStore.getState().setZoomLevel(zoom)
    }
    usePdfStore.getState().clearFitRequest()
  }, [fitRequest, containerWidth])

  // Track scroll position and update virtual pages at most once per frame.
  const handleScroll = useCallback(() => {
    runtimePerformance.recordPdfScrollEvent()
    if (pdfViewMode === 'single') return

    if (containerRef.current) {
      scrollPositionRef.current = containerRef.current.scrollTop
    }

    if (scrollFrameRef.current === null) {
      scrollFrameRef.current = requestAnimationFrame(() => {
        scrollFrameRef.current = null
        computeVisiblePages()
      })
    }

    // Debounced persist of scroll position per project
    if (scrollPersistTimerRef.current) clearTimeout(scrollPersistTimerRef.current)
    scrollPersistTimerRef.current = setTimeout(() => {
      if (projectRoot && containerRef.current) {
        usePdfStore.getState().saveScrollPosition(projectRoot, containerRef.current.scrollTop)
      }
    }, SCROLL_PERSIST_DEBOUNCE_MS)
  }, [computeVisiblePages, projectRoot, pdfViewMode])

  // Slide animation direction for single-page mode
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null)

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
        const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY)
        const delta = isHorizontal ? e.deltaX : e.deltaY
        if (delta === 0) return
        e.preventDefault()

        if (swipeCooldownRef.current) return

        // Use lower threshold for pure horizontal scroll (MX Master thumb wheel)
        const threshold =
          isHorizontal && e.deltaY === 0 ? SWIPE_THRESHOLD_HORIZONTAL : SWIPE_THRESHOLD

        swipeAccumRef.current += delta
        if (Math.abs(swipeAccumRef.current) >= threshold) {
          const { currentPage: cp, numPages: np } = usePdfStore.getState()
          const forward = swipeAccumRef.current > 0
          if (forward && cp < np) {
            setSlideDirection('left')
            usePdfStore.getState().setCurrentPage(cp + 1)
          } else if (!forward && cp > 1) {
            setSlideDirection('right')
            usePdfStore.getState().setCurrentPage(cp - 1)
          }
          swipeAccumRef.current = 0
          swipeCooldownRef.current = true
          setTimeout(() => {
            swipeCooldownRef.current = false
          }, SWIPE_COOLDOWN_MS)
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
            setSlideDirection('left')
            usePdfStore.getState().setCurrentPage(cp + 1)
          }
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          if (cp > 1) {
            e.preventDefault()
            setSlideDirection('right')
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
      const clamped = clampPage(cp, numPages)
      if (clamped !== cp) usePdfStore.getState().setCurrentPage(clamped)
    } else {
      // Switching to continuous — scroll to the current page position
      const cp = usePdfStore.getState().currentPage
      const container = containerRef.current
      if (container && cp > 1) {
        container.scrollTop = pageOffsets.get(cp) ?? 0
      }
    }
  }, [pdfViewMode, numPages, pageOffsets])

  // Recalculate visible pages when zoom or page count changes
  useEffect(() => {
    computeVisiblePages()
  }, [computeVisiblePages, zoomLevel])

  // Drop DOM-backed viewport entries once their virtual page is unmounted.
  // Page ratios remain cached so the cumulative scroll layout stays accurate.
  useEffect(() => {
    for (const [pageNumber, info] of pageViewportsRef.current) {
      const shouldKeep =
        info.element.isConnected &&
        (pdfViewMode === 'single'
          ? pageNumber === currentPage
          : numPages <= VIRTUALIZATION_THRESHOLD ||
            (pageNumber >= visibleRange.start && pageNumber <= visibleRange.end))
      if (!shouldKeep) pageViewportsRef.current.delete(pageNumber)
    }
  }, [currentPage, numPages, pdfViewMode, visibleRange])

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current)
      if (scrollPersistTimerRef.current) clearTimeout(scrollPersistTimerRef.current)
    }
  }, [])

  // Stage PDF bytes by revision. A newer generation remains hidden until its
  // current page has rendered, so the displayed document never flashes blank.
  useEffect(() => {
    if (!pdfPath) {
      dispatchGeneration({ type: 'clear' })
      setPdfError(null)
      return
    }
    dispatchGeneration({ type: 'request', revision: pdfRevision, path: pdfPath })
    let cancelled = false
    window.api
      .readFileBinary(pdfPath)
      .then((result: { data: Uint8Array }) => {
        if (cancelled) return
        dispatchGeneration({
          type: 'loaded',
          generation: {
            revision: pdfRevision,
            path: pdfPath,
            file: { data: result.data },
            numPages: null
          }
        })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        dispatchGeneration({ type: 'failed', revision: pdfRevision })
        const message = error instanceof Error ? error.message : String(error)
        if (!generationStateRef.current.displayed) setPdfError(message)
        useCompileStore.getState().appendLog(`PDF byte load error: ${message}\n`)
      })
    return () => {
      cancelled = true
    }
  }, [pdfPath, pdfRevision])

  const initializeDisplayedGeneration = useCallback(
    (loadedNumPages: number, restoreScroll: boolean) => {
      const targetPage = clampPage(usePdfStore.getState().currentPage, loadedNumPages)
      pageViewportsRef.current.clear()
      setPageAspectRatios(new Map())
      setVisibleRange(computeVisibleRange(targetPage, targetPage, loadedNumPages))
      usePdfStore.getState().setCurrentPage(targetPage)

      if (!restoreScroll) return
      requestAnimationFrame(() => {
        if (!containerRef.current) return
        const sessionScroll = scrollPositionRef.current
        if (sessionScroll > 0) {
          containerRef.current.scrollTop = sessionScroll
        } else if (projectRoot) {
          const saved = usePdfStore.getState().getScrollPosition(projectRoot)
          if (saved > 0) containerRef.current.scrollTop = saved
        }
      })
    },
    [projectRoot]
  )

  const handleDocumentLoadSuccess = useCallback(
    (generationRevision: number, loadedNumPages: number) => {
      const currentGeneration = generationStateRef.current.displayed
      const isInitialDisplayedLoad =
        currentGeneration?.revision === generationRevision && currentGeneration.numPages === null
      dispatchGeneration({
        type: 'documentLoaded',
        revision: generationRevision,
        numPages: loadedNumPages
      })
      if (isInitialDisplayedLoad) {
        setPdfError(null)
        initializeDisplayedGeneration(loadedNumPages, true)
      }
    },
    [initializeDisplayedGeneration]
  )

  const handleDocumentLoadError = useCallback((generationRevision: number, error: Error) => {
    dispatchGeneration({ type: 'failed', revision: generationRevision })
    const msg = error.message || 'Unknown PDF loading error'
    console.error('PDF load error:', msg, error)
    if (generationStateRef.current.displayed?.revision === generationRevision) setPdfError(msg)
    useCompileStore.getState().appendLog(`PDF viewer error: ${msg}\n`)
    useCompileStore.getState().setLogPanelOpen(true)
  }, [])

  const capturePageViewport = useCallback(
    (generationRevision: number, pageNumber: number, page: PDFPageProxy): boolean => {
      const container = containerRef.current
      if (!container) return false
      const generationEl = container.querySelector(`[data-pdf-generation="${generationRevision}"]`)
      const pageEl = generationEl?.querySelector(
        `[data-page-number="${pageNumber}"]`
      ) as HTMLDivElement | null
      if (!pageEl) return false

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
      const aspectRatio = actualPageHeight / actualPageWidth
      setPageAspectRatios((previous) => {
        const previousAspectRatio = previous.get(pageNumber)
        if (
          previousAspectRatio !== undefined &&
          Math.abs(previousAspectRatio - aspectRatio) <= 0.0001
        ) {
          return previous
        }
        const next = new Map(previous)
        next.set(pageNumber, aspectRatio)
        return next
      })
      return true
    },
    [containerWidth, zoomLevel]
  )

  const handlePageRenderSuccess = useCallback(
    (generationRevision: number, pageNumber: number) => {
      return (page: PDFPageProxy) => {
        if (generationStateRef.current.displayed?.revision !== generationRevision) return
        runtimePerformance.recordPdfPageRendered(generationRevision)
        capturePageViewport(generationRevision, pageNumber, page)
      }
    },
    [capturePageViewport]
  )

  const handlePendingPageRenderSuccess = useCallback(
    (generationRevision: number, pageNumber: number) => {
      return (page: PDFPageProxy) => {
        const pending = generationStateRef.current.pending
        if (pending?.revision !== generationRevision || pending.numPages === null) return
        const targetPage = clampPage(usePdfStore.getState().currentPage, pending.numPages)
        if (pageNumber !== targetPage) return

        initializeDisplayedGeneration(pending.numPages, false)
        capturePageViewport(generationRevision, pageNumber, page)
        runtimePerformance.recordPdfPageRendered(generationRevision)
        setPdfError(null)
        dispatchGeneration({ type: 'ready', revision: generationRevision })
      }
    },
    [capturePageViewport, initializeDisplayedGeneration]
  )

  const renderGenerationPages = (
    generation: PdfGeneration,
    isDisplayed: boolean
  ): React.ReactNode => {
    const generationNumPages = generation.numPages ?? 0
    if (generationNumPages === 0) return null

    const targetPage = clampPage(currentPage, generationNumPages)
    const renderPage = (pageNumber: number, keyPrefix: string): React.ReactNode => (
      <Page
        key={`${keyPrefix}_${pageNumber}`}
        pageNumber={pageNumber}
        width={pageWidth}
        renderTextLayer={isDisplayed}
        renderAnnotationLayer={isDisplayed}
        onRenderSuccess={
          isDisplayed
            ? handlePageRenderSuccess(generation.revision, pageNumber)
            : handlePendingPageRenderSuccess(generation.revision, pageNumber)
        }
      />
    )

    if (pdfViewMode === 'single') {
      return (
        <div
          className={`preview-single-page-container${isDisplayed && slideDirection ? ` preview-slide-${slideDirection}` : ''}`}
          onAnimationEnd={isDisplayed ? () => setSlideDirection(null) : undefined}
        >
          {renderPage(targetPage, 'single_page')}
        </div>
      )
    }

    if (generationNumPages <= VIRTUALIZATION_THRESHOLD) {
      const pageNumbers = isDisplayed
        ? Array.from({ length: generationNumPages }, (_, index) => index + 1)
        : [targetPage]
      return pageNumbers.map((pageNumber) => renderPage(pageNumber, 'page'))
    }

    const generationLayout = isDisplayed
      ? { totalHeight, pageOffsets }
      : buildCumulativeLayout(generationNumPages, getPageHeight)
    const pageNumbers = isDisplayed ? virtualPageNumbers : [targetPage]
    return (
      <div style={{ height: generationLayout.totalHeight, position: 'relative' }}>
        {pageNumbers.map((pageNumber) => (
          <div
            key={`page_${pageNumber}`}
            data-virtual-page-number={pageNumber}
            style={{
              position: 'absolute',
              top: generationLayout.pageOffsets.get(pageNumber) ?? 0,
              left: 0,
              right: 0
            }}
          >
            {renderPage(pageNumber, 'page')}
          </div>
        ))}
      </div>
    )
  }

  const generationLayers = [displayedGeneration, pendingGeneration].filter(
    (generation): generation is PdfGeneration => generation !== null
  )

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
      {compileStatus === 'error' && !displayedGeneration ? (
        <div className="preview-center preview-error">
          <p>Compilation failed. Check the log panel.</p>
        </div>
      ) : !displayedGeneration ? (
        <div className="preview-center preview-empty">
          <div>
            <p>No PDF to display</p>
            <p>Open a .tex file and compile to see the preview</p>
          </div>
        </div>
      ) : (
        <>
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
            {generationLayers.map((generation) => {
              const isDisplayed = generation.revision === displayedRevision
              return (
                <div
                  key={generation.revision}
                  data-pdf-generation={generation.revision}
                  aria-hidden={!isDisplayed}
                  style={
                    isDisplayed
                      ? undefined
                      : {
                          position: 'absolute',
                          inset: 0,
                          visibility: 'hidden',
                          pointerEvents: 'none'
                        }
                  }
                >
                  <Document
                    file={generation.file}
                    onLoadSuccess={({ numPages: loadedNumPages }) =>
                      handleDocumentLoadSuccess(generation.revision, loadedNumPages)
                    }
                    onLoadError={(error) => handleDocumentLoadError(generation.revision, error)}
                    loading={
                      isDisplayed ? (
                        <div className="preview-center">
                          <div>
                            <div className="preview-spinner" />
                            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                              Loading PDF...
                            </p>
                          </div>
                        </div>
                      ) : null
                    }
                  >
                    {renderGenerationPages(generation, isDisplayed)}
                  </Document>
                </div>
              )
            })}
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
          {highlights.lineStyle && (
            <div className="synctex-line-highlight" style={highlights.lineStyle} />
          )}
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

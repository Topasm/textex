import { PdfSearchBar } from './search/PdfSearchBar'
import { requestLocalSearch } from '../services/localSearch'
import { memo, useMemo, useRef, useCallback, useState, useEffect, useReducer } from 'react'
import { useTranslation } from 'react-i18next'
import { Document, pdfjs } from 'react-pdf'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { useCompileStore } from '../store/useCompileStore'
import { usePdfStore } from '../store/usePdfStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { useProjectStore } from '../store/useProjectStore'
import { usePreviewZoom } from '../hooks/preview/usePreviewZoom'
import { useSynctex } from '../hooks/preview/useSynctex'
import { useScrollSync } from '../hooks/preview/useScrollSync'
import { usePdfSearch } from '../hooks/preview/usePdfSearch'
import { usePdfSelection } from '../hooks/preview/usePdfSelection'
import { useCitationTooltip } from '../hooks/preview/useCitationTooltip'
import { useContainerSize } from '../hooks/preview/useContainerSize'
import { usePreviewPageSwipe } from '../hooks/preview/usePreviewPageSwipe'
import CitationTooltip from './CitationTooltip'
import BufferedPdfPage from './BufferedPdfPage'
import { runtimePerformance } from '../services/runtimePerformance'
import { normalizeDocumentId } from '../models/documentRegistry'
import { projectPathKey } from '../services/projectIndex'
import {
  initialPdfGenerationState,
  reducePdfGeneration,
  type PdfGeneration
} from './previewGeneration'
import {
  SCROLL_PERSIST_DEBOUNCE_MS,
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

// Use ?url so Vite emits a stable worker asset URL for the Tauri webview.
// The new URL() pattern can fail for node_modules dependencies.
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

interface PageViewportInfo {
  viewport: { convertToViewportPoint(x: number, y: number): number[]; viewBox: number[] }
  element: HTMLDivElement
  pageWidth: number // actual PDF page width in points
  pageHeight: number // actual PDF page height in points
}

function PreviewPane() {
  const { t } = useTranslation()
  const pdfPath = useCompileStore((s) => s.pdfPath)
  const pdfRevision = useCompileStore((s) => s.pdfRevision)
  const pdfDocumentId = useCompileStore((s) => s.pdfDocumentId)
  const compileStatus = useCompileStore((s) => s.compileStatus)
  const zoomLevel = usePdfStore((s) => s.zoomLevel)
  const fitRequest = usePdfStore((s) => s.fitRequest)
  const pdfInvertMode = useSettingsStore((s) => s.settings.pdfInvertMode)
  const pdfViewMode = useSettingsStore((s) => s.settings.pdfViewMode ?? 'continuous')
  const currentPage = usePdfStore((s) => s.currentPage)
  const projectRoot = useProjectStore((s) => s.projectRoot)
  const viewPositionKey = useMemo(() => {
    if (pdfDocumentId) return `document:${normalizeDocumentId(pdfDocumentId)}`
    if (projectRoot) return `project:${projectPathKey(projectRoot)}`
    return pdfPath ? `pdf:${normalizeDocumentId(pdfPath)}` : null
  }, [pdfDocumentId, pdfPath, projectRoot])
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollPositionRef = useRef(0)
  const currentPageRef = useRef(1)
  const activeViewPositionKeyRef = useRef<string | null>(null)
  const displayedViewPositionKeyRef = useRef<string | null>(null)
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
  const { highlights, handleContainerClick } = useSynctex(
    containerRef,
    pageViewportsRef,
    displayedRevision
  )
  useScrollSync({ containerRef, pageViewportsRef, containerWidth, pdfRevision: displayedRevision })
  useEffect(() => {
    usePdfStore.getState().setPdfSearchQuery('')
    return () => {
      usePdfStore.getState().setPdfSearchVisible(false)
      usePdfStore.getState().setPdfSearchQuery('')
    }
  }, [pdfDocumentId, projectRoot])
  const search = usePdfSearch(containerRef, displayedGeneration?.document, displayedRevision)
  usePdfSelection(containerRef, pageViewportsRef, displayedRevision)
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
    if (pdfViewMode === 'single' || !container || numPages === 0 || cumulativeHeights.length === 0)
      return

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
  }, [numPages, cumulativeHeights, pdfViewMode])

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
      if (!containerRef.current) return
      const scrollTop = containerRef.current.scrollTop
      const pdfStore = usePdfStore.getState()
      if (projectRoot) pdfStore.saveScrollPosition(projectRoot, scrollTop)
      if (viewPositionKey) {
        pdfStore.saveViewPosition(viewPositionKey, currentPageRef.current, scrollTop)
      }
    }, SCROLL_PERSIST_DEBOUNCE_MS)
  }, [computeVisiblePages, projectRoot, pdfViewMode, viewPositionKey])

  // Capture page changes in both continuous and single-page modes. The refs
  // deliberately update in effects so a project-clear render cannot overwrite
  // the previous document's cleanup snapshot with page 1.
  useEffect(() => {
    currentPageRef.current = currentPage
    if (viewPositionKey && activeViewPositionKeyRef.current === viewPositionKey) {
      usePdfStore
        .getState()
        .saveViewPosition(viewPositionKey, currentPage, scrollPositionRef.current)
    }
  }, [currentPage, viewPositionKey])

  // Restore an independent view for each compiled source document. Saving in
  // cleanup also covers a quick project/document switch before the debounced
  // scroll persistence timer fires.
  useEffect(() => {
    if (!viewPositionKey) {
      scrollPositionRef.current = 0
      currentPageRef.current = 1
      activeViewPositionKeyRef.current = null
      return
    }

    const pdfStore = usePdfStore.getState()
    const saved = pdfStore.getViewPosition(viewPositionKey)
    const hasDocumentView = Object.keys(pdfStore.savedViewPositions).some((key) =>
      key.startsWith('document:')
    )
    const restoredScroll =
      saved?.scrollTop ??
      (!hasDocumentView && projectRoot ? pdfStore.getScrollPosition(projectRoot) : 0)
    const restoredPage = saved?.currentPage ?? 1
    scrollPositionRef.current = restoredScroll
    currentPageRef.current = restoredPage
    activeViewPositionKeyRef.current = viewPositionKey
    pdfStore.setCurrentPage(restoredPage)
    const viewContainer = containerRef.current

    return () => {
      const scrollTop = viewContainer?.scrollTop ?? scrollPositionRef.current
      pdfStore.saveViewPosition(viewPositionKey, currentPageRef.current, scrollTop)
      if (activeViewPositionKeyRef.current === viewPositionKey) {
        activeViewPositionKeyRef.current = null
      }
    }
  }, [projectRoot, viewPositionKey])

  // Wheel navigation: a horizontal flick turns one page through the shared
  // gesture layer, vertical travel and continuous-mode scrolling stay local.
  const { slideDirection, clearSlideDirection, stepPage } = usePreviewPageSwipe({
    containerRef,
    pdfViewMode
  })
  const previousPdfViewModeRef = useRef(pdfViewMode)

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

        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          if (stepPage(1)) e.preventDefault()
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          if (stepPage(-1)) e.preventDefault()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [pdfViewMode, stepPage])

  // Handle view mode transitions
  useEffect(() => {
    const previousViewMode = previousPdfViewModeRef.current
    previousPdfViewModeRef.current = pdfViewMode
    if (numPages === 0) return
    if (pdfViewMode === 'single') {
      // Clamp currentPage to valid range
      const cp = usePdfStore.getState().currentPage
      const clamped = clampPage(cp, numPages)
      if (clamped !== cp) usePdfStore.getState().setCurrentPage(clamped)
    } else if (previousViewMode === 'single') {
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
      displayedViewPositionKeyRef.current = null
      setPdfError(null)
      return
    }
    dispatchGeneration({ type: 'request', revision: pdfRevision, path: pdfPath })
    let cancelled = false
    window.api
      .readCompiledPdf(pdfPath)
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
      const requestedPage = restoreScroll
        ? currentPageRef.current
        : usePdfStore.getState().currentPage
      const targetPage = clampPage(requestedPage, loadedNumPages)
      pageViewportsRef.current.clear()
      setPageAspectRatios(new Map())
      setVisibleRange(computeVisibleRange(targetPage, targetPage, loadedNumPages))
      usePdfStore.getState().setCurrentPage(targetPage)

      if (!restoreScroll) return
      requestAnimationFrame(() => {
        if (!containerRef.current) return
        containerRef.current.scrollTop = scrollPositionRef.current
        usePdfStore.getState().setCurrentPage(targetPage)
      })
    },
    []
  )

  const handleDocumentLoadSuccess = useCallback(
    (generationRevision: number, document: PDFDocumentProxy) => {
      const loadedNumPages = document.numPages
      const currentGeneration = generationStateRef.current.displayed
      const isInitialDisplayedLoad =
        currentGeneration?.revision === generationRevision && currentGeneration.numPages === null
      dispatchGeneration({
        type: 'documentLoaded',
        revision: generationRevision,
        numPages: loadedNumPages,
        document
      })
      if (isInitialDisplayedLoad) {
        setPdfError(null)
        initializeDisplayedGeneration(loadedNumPages, true)
        displayedViewPositionKeyRef.current = viewPositionKey
      }
    },
    [initializeDisplayedGeneration, viewPositionKey]
  )

  const handleDocumentLoadError = useCallback((generationRevision: number, error: Error) => {
    dispatchGeneration({ type: 'failed', revision: generationRevision })
    const msg = error.message || 'Unknown PDF loading error'
    console.error('PDF load error:', msg, error)
    if (generationStateRef.current.displayed?.revision === generationRevision) setPdfError(msg)
    useCompileStore.getState().appendLog(`PDF viewer error: ${msg}\n`)
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

        const restoreDocumentView = displayedViewPositionKeyRef.current !== viewPositionKey
        initializeDisplayedGeneration(pending.numPages, restoreDocumentView)
        capturePageViewport(generationRevision, pageNumber, page)
        runtimePerformance.recordPdfPageRendered(generationRevision)
        setPdfError(null)
        dispatchGeneration({ type: 'ready', revision: generationRevision })
        displayedViewPositionKeyRef.current = viewPositionKey
      }
    },
    [capturePageViewport, initializeDisplayedGeneration, viewPositionKey]
  )

  const renderGenerationPages = (
    generation: PdfGeneration,
    isDisplayed: boolean
  ): React.ReactNode => {
    const generationNumPages = generation.numPages ?? 0
    if (generationNumPages === 0) return null

    const targetPage = clampPage(currentPage, generationNumPages)
    const renderPage = (pageNumber: number, keyPrefix: string): React.ReactNode => (
      <BufferedPdfPage
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
          onAnimationEnd={isDisplayed ? clearSlideDirection : undefined}
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
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
          event.preventDefault()
          event.stopPropagation()
          requestLocalSearch('pdf')
        }
      }}
      tabIndex={-1}
      onScroll={handleScroll}
      onClick={handleContainerClick}
      style={{ position: 'relative' }}
    >
      {displayedGeneration && <PdfSearchBar search={search} />}
      {compileStatus === 'error' && !displayedGeneration ? (
        <div className="preview-center preview-error">
          <p>{t('previewPane.compileFailed')}</p>
        </div>
      ) : !displayedGeneration ? (
        <div className="preview-center preview-empty">
          <div>
            <p>{t('previewPane.noPdf')}</p>
            <p>{t('previewPane.noPdfHint')}</p>
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
                    onLoadSuccess={(document) =>
                      handleDocumentLoadSuccess(generation.revision, document)
                    }
                    onLoadError={(error) => handleDocumentLoadError(generation.revision, error)}
                    loading={
                      isDisplayed ? (
                        <div className="preview-center">
                          <div>
                            <div className="preview-spinner" />
                            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                              {t('previewPane.loadingPdf')}
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
              <p>{t('previewPane.loadFailed', { reason: pdfError })}</p>
              <p>{t('previewPane.checkProblems')}</p>
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

export default memo(PreviewPane)

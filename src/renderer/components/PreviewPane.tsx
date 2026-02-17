import { useMemo, useRef, useCallback, useState, useEffect } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { useAppStore } from '../store/useAppStore'
import PdfSearchBar from './PdfSearchBar'
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
  const synctexHighlight = useAppStore((s) => s.synctexHighlight)
  const zoomLevel = useAppStore((s) => s.zoomLevel)
  const pdfInvertMode = useAppStore((s) => s.settings.pdfInvertMode)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollPositionRef = useRef(0)
  const [numPages, setNumPages] = useState(0)
  const [containerWidth, setContainerWidth] = useState<number | null>(null)
  const [ctrlHeld, setCtrlHeld] = useState(false)
  const pageViewportsRef = useRef<Map<number, PageViewportInfo>>(new Map())
  const [highlightStyle, setHighlightStyle] = useState<React.CSSProperties | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)

  // Transient zoom state: CSS transform during wheel zoom for instant feedback
  const [transientScale, setTransientScale] = useState<number | null>(null)
  const transientTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingZoomRef = useRef<number | null>(null)

  // PDF search state
  const [searchVisible, setSearchVisible] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMatches, setSearchMatches] = useState<HTMLElement[]>([])
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)

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

  // Ctrl+scroll wheel zoom — use CSS transform for instant feedback,
  // then debounce the actual react-pdf re-render for performance
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()

      const s = useAppStore.getState()
      const step = 5
      // Use pending zoom as base if we're mid-scroll, otherwise current store value
      const baseZoom = pendingZoomRef.current ?? s.zoomLevel
      const newZoom =
        e.deltaY < 0
          ? Math.min(400, baseZoom + step)
          : Math.max(25, baseZoom - step)
      pendingZoomRef.current = newZoom

      // Instant visual feedback via CSS transform
      setTransientScale(newZoom / s.zoomLevel)

      // Debounce the actual re-render
      if (transientTimerRef.current) clearTimeout(transientTimerRef.current)
      transientTimerRef.current = setTimeout(() => {
        const finalZoom = pendingZoomRef.current ?? newZoom
        pendingZoomRef.current = null
        useAppStore.getState().setZoomLevel(finalZoom)
        setTransientScale(null)
      }, 150)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
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

    const { viewport, element, pageHeight } = info
    // SyncTeX y is measured from the TOP of the page (top-down), but PDF.js
    // convertToViewportPoint expects PDF coordinates (bottom-up, origin at bottom-left).
    // Invert y using the page height, matching Overleaf's highlights.ts approach:
    //   viewBoxHeight - synctexY
    const pdfY = pageHeight - y
    const [vx, vy] = viewport.convertToViewportPoint(x, pdfY)

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

  // Sync buttons: PDF → Code (←) and Code → PDF (→)
  const handleSyncToCode = useCallback(() => {
    const filePath = useAppStore.getState().filePath
    if (!filePath) return

    const container = containerRef.current
    if (!container) return

    // Find the page most visible in the viewport
    let bestPage: number | null = null
    let bestVisibleArea = 0

    const containerRect = container.getBoundingClientRect()
    for (const [pageNum, info] of pageViewportsRef.current) {
      const rect = info.element.getBoundingClientRect()
      const overlapTop = Math.max(rect.top, containerRect.top)
      const overlapBottom = Math.min(rect.bottom, containerRect.bottom)
      const visibleHeight = Math.max(0, overlapBottom - overlapTop)
      const overlapLeft = Math.max(rect.left, containerRect.left)
      const overlapRight = Math.min(rect.right, containerRect.right)
      const visibleWidth = Math.max(0, overlapRight - overlapLeft)
      const area = visibleWidth * visibleHeight
      if (area > bestVisibleArea) {
        bestVisibleArea = area
        bestPage = pageNum
      }
    }

    if (bestPage === null) return

    // Use center of the visible portion of the page
    const info = pageViewportsRef.current.get(bestPage)
    if (!info) return
    const pageRect = info.element.getBoundingClientRect()
    const centerX = (Math.max(pageRect.left, containerRect.left) + Math.min(pageRect.right, containerRect.right)) / 2 - pageRect.left
    const centerY = (Math.max(pageRect.top, containerRect.top) + Math.min(pageRect.bottom, containerRect.bottom)) / 2 - pageRect.top

    // Use actual page width for correct coordinate conversion (not hardcoded 612)
    const pw = containerWidth
      ? (containerWidth - 32) * (useAppStore.getState().zoomLevel / 100)
      : info.pageWidth
    const scale = pw / info.pageWidth
    const pdfX = centerX / scale
    const pdfY = centerY / scale

    window.api.synctexInverse(filePath, bestPage, pdfX, pdfY).then((result) => {
      if (result) {
        useAppStore.getState().requestJumpToLine(result.line, result.column || 1)
      }
    })
  }, [containerWidth])

  const handleSyncToPdf = useCallback(() => {
    const state = useAppStore.getState()
    const filePath = state.filePath
    if (!filePath) return

    window.api.synctexForward(filePath, state.cursorLine).then((result) => {
      if (result) {
        useAppStore.getState().setSynctexHighlight(result)
      }
    })
  }, [])

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

      // Convert screen coordinates to PDF coordinates (synctex top-down system)
      // Use actual page width for correct scaling (not hardcoded 612)
      const pw = containerWidth
        ? (containerWidth - 32) * (useAppStore.getState().zoomLevel / 100)
        : info.pageWidth
      const scale = pw / info.pageWidth
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

  // Keyboard handler for Ctrl+F search toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        // Only handle if the preview pane is focused/hovered
        const container = containerRef.current
        if (!container) return
        if (!container.matches(':hover') && !container.contains(document.activeElement)) return
        e.preventDefault()
        e.stopPropagation()
        setSearchVisible(true)
      }
      if (e.key === 'Escape' && searchVisible) {
        setSearchVisible(false)
        setSearchQuery('')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [searchVisible])

  // Perform search in text layer spans
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Clear previous highlights
    container.querySelectorAll('.pdf-search-highlight').forEach((el) => {
      el.classList.remove('pdf-search-highlight', 'pdf-search-current')
    })

    if (!searchQuery || !searchVisible) {
      setSearchMatches([])
      setCurrentMatchIndex(0)
      return
    }

    const query = searchQuery.toLowerCase()
    const matches: HTMLElement[] = []

    // Search in text layer spans
    const spans = container.querySelectorAll('.react-pdf__Page__textContent span')
    spans.forEach((span) => {
      const text = span.textContent?.toLowerCase() || ''
      if (text.includes(query)) {
        const el = span as HTMLElement
        el.classList.add('pdf-search-highlight')
        matches.push(el)
      }
    })

    setSearchMatches(matches)
    setCurrentMatchIndex(0)

    // Highlight first match as current
    if (matches.length > 0) {
      matches[0].classList.add('pdf-search-current')
      matches[0].scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [searchQuery, searchVisible, numPages])

  const handleSearchNext = useCallback(() => {
    if (searchMatches.length === 0) return
    searchMatches[currentMatchIndex]?.classList.remove('pdf-search-current')
    const next = (currentMatchIndex + 1) % searchMatches.length
    setCurrentMatchIndex(next)
    searchMatches[next]?.classList.add('pdf-search-current')
    searchMatches[next]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [searchMatches, currentMatchIndex])

  const handleSearchPrev = useCallback(() => {
    if (searchMatches.length === 0) return
    searchMatches[currentMatchIndex]?.classList.remove('pdf-search-current')
    const prev = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length
    setCurrentMatchIndex(prev)
    searchMatches[prev]?.classList.add('pdf-search-current')
    searchMatches[prev]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [searchMatches, currentMatchIndex])

  const handleSearchClose = useCallback(() => {
    setSearchVisible(false)
    setSearchQuery('')
  }, [])

  // Listen for sync requests from toolbar
  const syncToCodeRequest = useAppStore((s) => s.syncToCodeRequest)
  useEffect(() => {
    if (syncToCodeRequest) {
      handleSyncToCode()
    }
  }, [syncToCodeRequest])



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

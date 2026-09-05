import { useState, useEffect, useCallback, useRef } from 'react'
import { useEditorStore } from '../../store/useEditorStore'
import { usePdfStore } from '../../store/usePdfStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { SYNCTEX_HIGHLIGHT_MS } from '../../constants'
import { capturePdfSourceContext, preparePdfSource } from '../../services/pdfSourceNavigation'
import { previewSourceRange } from '../../utils/previewSelection'
import { logError } from '../../utils/errorMessage'

interface PageViewportInfo {
  viewport: { convertToViewportPoint(x: number, y: number): number[]; viewBox: number[] }
  element: HTMLDivElement
  pageWidth: number
  pageHeight: number
}

export interface SynctexHighlights {
  lineStyle: React.CSSProperties | null
  dotStyle: React.CSSProperties | null
}

export interface SynctexState {
  highlights: SynctexHighlights
  handleSyncToCode: () => void
  handleContainerClick: (e: React.MouseEvent<HTMLDivElement>) => void
}

export function useSynctex(
  containerRef: React.RefObject<HTMLDivElement | null>,
  pageViewportsRef: React.RefObject<Map<number, PageViewportInfo>>,
  displayedRevision: number
): SynctexState {
  const inverseRequestRef = useRef(0)
  useEffect(
    () => () => {
      inverseRequestRef.current++
    },
    [displayedRevision]
  )
  const requestInverseSync = useCallback(
    async (page: number, pdfX: number, pdfY: number) => {
      const requestId = ++inverseRequestRef.current
      const context = capturePdfSourceContext(displayedRevision)
      if (!context || !Number.isFinite(pdfX) || !Number.isFinite(pdfY)) return
      const current = () => requestId === inverseRequestRef.current && context.isCurrent()
      try {
        const result = await window.api.synctexInverse(context.sourcePath, page, pdfX, pdfY)
        if (!current() || !result) return
        const prepared = await preparePdfSource(result.file, current)
        if (!prepared) return
        const range = previewSourceRange(prepared.text, '', result.line, result.line)
        if (!range) return
        const snapshot = prepared.activate()
        if (!snapshot) return
        const state = useEditorStore.getState()
        const column = Math.min(Math.max(1, result.column || 1), range.end.column)
        state.requestJumpToLine(result.line, column, false, {
          documentId: snapshot.documentId,
          revision: snapshot.revision,
          pdfRevision: context.pdfRevision,
          tabMutationEpoch: state.tabMutationEpoch
        })
      } catch (error) {
        if (current()) logError('SyncTeX:inverse', error)
      }
    },
    [displayedRevision]
  )
  const synctexHighlight = usePdfStore((s) => s.synctexHighlight)
  const [highlights, setHighlights] = useState<SynctexHighlights>({
    lineStyle: null,
    dotStyle: null
  })

  // React to synctexHighlight changes — show line bar + dot indicator + scroll
  useEffect(() => {
    if (!synctexHighlight) {
      setHighlights({ lineStyle: null, dotStyle: null })
      return
    }

    const { page, x, y } = synctexHighlight
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let fadeTimer: ReturnType<typeof setTimeout> | null = null

    const isSinglePage = useSettingsStore.getState().settings.pdfViewMode === 'single'

    const positionHighlights = (
      viewport: PageViewportInfo['viewport'],
      element: HTMLDivElement
    ): void => {
      const pageRect = element.getBoundingClientRect()
      const viewportWidth =
        'width' in viewport && typeof viewport.width === 'number' ? viewport.width : pageRect.width
      const displayScale = viewportWidth > 0 ? pageRect.width / viewportWidth : 1
      // Convert SyncTeX top-down y to PDF bottom-up user space using viewBox[3]
      // (the max Y of the page's MediaBox). This matches how Overleaf converts
      // synctex coordinates and correctly handles non-standard page origins.
      const viewBoxTop = viewport.viewBox[3]
      const pdfY = viewBoxTop - y
      const [rawVx, rawVy] = viewport.convertToViewportPoint(x, pdfY)
      const vx = rawVx * displayScale
      const vy = rawVy * displayScale
      if (!isSinglePage) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }

      const containerRect = containerRef.current?.getBoundingClientRect()
      if (!containerRect) return

      const scrollLeft = containerRef.current?.scrollLeft ?? 0
      const scrollTop = containerRef.current?.scrollTop ?? 0
      const pageLeft = pageRect.left - containerRect.left + scrollLeft
      const pageTop = pageRect.top - containerRect.top + scrollTop

      setHighlights({
        lineStyle: {
          position: 'absolute',
          left: pageLeft,
          top: pageTop + vy,
          width: pageRect.width
        },
        dotStyle: {
          position: 'absolute',
          left: pageLeft + vx,
          top: pageTop + vy,
          width: 30,
          height: 30
        }
      })

      fadeTimer = setTimeout(() => {
        setHighlights({ lineStyle: null, dotStyle: null })
        usePdfStore.getState().setSynctexHighlight(null)
      }, SYNCTEX_HIGHLIGHT_MS)
    }

    const tryShowHighlight = (attempt: number): void => {
      if (cancelled) return

      const info = pageViewportsRef.current?.get(page)
      if (info) {
        // Verify the cached DOM element is still in the document (it may have been
        // unmounted by virtual scrolling). If stale, remove and fall through to retry.
        if (info.element.isConnected) {
          positionHighlights(info.viewport, info.element)
          return
        }
        pageViewportsRef.current.delete(page)
      }

      // Page viewport not ready — navigate/scroll to page and retry
      if (attempt === 0) {
        const pdfState = usePdfStore.getState()
        if (pdfState.scrollToPage) pdfState.scrollToPage(page)
        else if (isSinglePage) pdfState.setCurrentPage(page)
      }

      // Retry up to 15 times (1.5 seconds total) — enough for page to render
      if (attempt < 15) {
        retryTimer = setTimeout(() => tryShowHighlight(attempt + 1), 100)
      } else {
        logError('SyncTeX:highlight', `Timed out waiting for page ${page} viewport`)
      }
    }

    tryShowHighlight(0)

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
      if (fadeTimer) clearTimeout(fadeTimer)
    }
  }, [synctexHighlight, containerRef, pageViewportsRef])

  // Sync PDF → Code: find most visible page and inverse synctex from its center
  const handleSyncToCode = useCallback(() => {
    const container = containerRef.current
    if (!container || !pageViewportsRef.current) return

    let bestPage: number | null = null
    let bestVisibleArea = 0

    const containerRect = container.getBoundingClientRect()
    for (const [pageNum, info] of pageViewportsRef.current) {
      if (!info.element.isConnected) continue
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

    const info = pageViewportsRef.current.get(bestPage)
    if (!info) return
    const pageRect = info.element.getBoundingClientRect()
    const centerX =
      (Math.max(pageRect.left, containerRect.left) +
        Math.min(pageRect.right, containerRect.right)) /
        2 -
      pageRect.left
    const centerY =
      (Math.max(pageRect.top, containerRect.top) +
        Math.min(pageRect.bottom, containerRect.bottom)) /
        2 -
      pageRect.top

    const scale = pageRect.width / info.pageWidth
    const pdfX = centerX / scale
    const pdfY = centerY / scale

    void requestInverseSync(bestPage, pdfX, pdfY)
  }, [containerRef, pageViewportsRef, requestInverseSync])

  // Ctrl+Click inverse SyncTeX handler
  const handleContainerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!(e.ctrlKey || e.metaKey)) return

      const container = containerRef.current
      if (!container || !pageViewportsRef.current) return

      let targetPageNumber: number | null = null
      let targetPageEl: HTMLDivElement | null = null

      for (const [pageNum, info] of pageViewportsRef.current) {
        if (!info.element.isConnected) continue
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

      const pageRect = targetPageEl.getBoundingClientRect()
      const clickX = e.clientX - pageRect.left
      const clickY = e.clientY - pageRect.top

      const scale = pageRect.width / info.pageWidth
      const pdfX = clickX / scale
      const pdfY = clickY / scale

      void requestInverseSync(targetPageNumber, pdfX, pdfY)
    },
    [containerRef, pageViewportsRef, requestInverseSync]
  )

  // Listen for sync requests from toolbar
  const syncToCodeRequest = usePdfStore((s) => s.syncToCodeRequest)
  useEffect(() => {
    if (syncToCodeRequest) {
      handleSyncToCode()
      // Clear the request so it doesn't re-trigger when dependencies change
      usePdfStore.setState({ syncToCodeRequest: null })
    }
  }, [syncToCodeRequest, handleSyncToCode])

  return { highlights, handleSyncToCode, handleContainerClick }
}

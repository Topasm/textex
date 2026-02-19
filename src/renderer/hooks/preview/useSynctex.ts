import { useState, useEffect, useCallback } from 'react'
import { useEditorStore } from '../../store/useEditorStore'
import { usePdfStore } from '../../store/usePdfStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { SYNCTEX_HIGHLIGHT_MS } from '../../constants'

interface PageViewportInfo {
  viewport: { convertToViewportPoint(x: number, y: number): [number, number]; viewBox: number[] }
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
  containerWidth: number | null
): SynctexState {
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
    console.log(`[SyncTeX UI] highlight effect: page=${page}, x=${x.toFixed(2)}, y=${y.toFixed(2)}`)

    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let fadeTimer: ReturnType<typeof setTimeout> | null = null

    const isSinglePage = useSettingsStore.getState().settings.pdfViewMode === 'single'

    const positionHighlights = (
      viewport: PageViewportInfo['viewport'],
      element: HTMLDivElement,
      pageHeight: number
    ): void => {
      const pdfY = pageHeight - y
      const [vx, vy] = viewport.convertToViewportPoint(x, pdfY)
      console.log(
        `[SyncTeX UI] pageHeight=${pageHeight.toFixed(2)}, pdfY=${pdfY.toFixed(2)} -> viewport vx=${vx.toFixed(1)}, vy=${vy.toFixed(1)}`
      )

      if (!isSinglePage) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }

      const containerRect = containerRef.current?.getBoundingClientRect()
      const pageRect = element.getBoundingClientRect()
      if (!containerRect) return

      const scrollLeft = containerRef.current?.scrollLeft ?? 0
      const scrollTop = containerRef.current?.scrollTop ?? 0
      const pageLeft = pageRect.left - containerRect.left + scrollLeft
      const pageTop = pageRect.top - containerRect.top + scrollTop

      console.log(
        `[SyncTeX UI] positioning: pageTop=${pageTop.toFixed(1)}, pageLeft=${pageLeft.toFixed(1)}, highlight top=${(pageTop + vy).toFixed(1)}`
      )

      setHighlights({
        lineStyle: {
          position: 'absolute',
          left: pageLeft,
          top: pageTop + vy,
          width: pageRect.width,
          height: 0 // set via CSS
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
        positionHighlights(info.viewport, info.element, info.pageHeight)
        return
      }

      // Page viewport not ready — navigate/scroll to page and retry
      if (attempt === 0) {
        console.log(`[SyncTeX UI] page ${page} viewport NOT available, scrolling and retrying`)
        if (isSinglePage) {
          usePdfStore.getState().setCurrentPage(page)
        } else {
          const container = containerRef.current
          if (container) {
            const pageEl = container.querySelector(
              `[data-page-number="${page}"]`
            ) as HTMLDivElement | null
            if (pageEl) {
              pageEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
          }
        }
      }

      // Retry up to 15 times (1.5 seconds total) — enough for page to render
      if (attempt < 15) {
        retryTimer = setTimeout(() => tryShowHighlight(attempt + 1), 100)
      } else {
        console.warn(`[SyncTeX UI] gave up waiting for page ${page} viewport`)
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
    const filePath = useEditorStore.getState().filePath
    if (!filePath) return

    const container = containerRef.current
    if (!container || !pageViewportsRef.current) return

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

    const pw = containerWidth
      ? (containerWidth - 32) * (usePdfStore.getState().zoomLevel / 100)
      : info.pageWidth
    const scale = pw / info.pageWidth
    const pdfX = centerX / scale
    const pdfY = centerY / scale

    window.api.synctexInverse(filePath, bestPage, pdfX, pdfY).then((result) => {
      if (result) {
        useEditorStore.getState().requestJumpToLine(result.line, result.column || 1)
      }
    })
  }, [containerRef, pageViewportsRef, containerWidth])

  // Ctrl+Click inverse SyncTeX handler
  const handleContainerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!(e.ctrlKey || e.metaKey)) return

      const filePath = useEditorStore.getState().filePath
      if (!filePath) return

      const container = containerRef.current
      if (!container || !pageViewportsRef.current) return

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

      const pageRect = targetPageEl.getBoundingClientRect()
      const clickX = e.clientX - pageRect.left
      const clickY = e.clientY - pageRect.top

      const pw = containerWidth
        ? (containerWidth - 32) * (usePdfStore.getState().zoomLevel / 100)
        : info.pageWidth
      const scale = pw / info.pageWidth
      const pdfX = clickX / scale
      const pdfY = clickY / scale

      window.api.synctexInverse(filePath, targetPageNumber, pdfX, pdfY).then((result) => {
        if (result) {
          useEditorStore.getState().requestJumpToLine(result.line, result.column || 1)
        }
      })
    },
    [containerRef, pageViewportsRef, containerWidth]
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

import { useState, useEffect, useCallback } from 'react'
import { useEditorStore } from '../../store/useEditorStore'
import { usePdfStore } from '../../store/usePdfStore'
import { SYNCTEX_HIGHLIGHT_MS } from '../../constants'

interface PageViewportInfo {
  viewport: { convertToViewportPoint(x: number, y: number): [number, number]; viewBox: number[] }
  element: HTMLDivElement
  pageWidth: number
  pageHeight: number
}

export interface SynctexState {
  highlightStyle: React.CSSProperties | null
  handleSyncToCode: () => void
  handleContainerClick: (e: React.MouseEvent<HTMLDivElement>) => void
}

export function useSynctex(
  containerRef: React.RefObject<HTMLDivElement | null>,
  pageViewportsRef: React.RefObject<Map<number, PageViewportInfo>>,
  containerWidth: number | null
): SynctexState {
  const synctexHighlight = usePdfStore((s) => s.synctexHighlight)
  const [highlightStyle, setHighlightStyle] = useState<React.CSSProperties | null>(null)

  // React to synctexHighlight changes — show indicator + scroll
  useEffect(() => {
    if (!synctexHighlight) {
      setHighlightStyle(null)
      return
    }

    const { page, x, y } = synctexHighlight
    const info = pageViewportsRef.current?.get(page)
    if (!info) {
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
    const pdfY = pageHeight - y
    const [vx, vy] = viewport.convertToViewportPoint(x, pdfY)

    element.scrollIntoView({ behavior: 'smooth', block: 'center' })

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

    const timer = setTimeout(() => {
      setHighlightStyle(null)
      usePdfStore.getState().setSynctexHighlight(null)
    }, SYNCTEX_HIGHLIGHT_MS)
    return () => clearTimeout(timer)
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
    }
  }, [syncToCodeRequest, handleSyncToCode])

  return { highlightStyle, handleSyncToCode, handleContainerClick }
}

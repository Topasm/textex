import { useEffect, useRef } from 'react'
import { useEditorStore } from '../../store/useEditorStore'
import { usePdfStore } from '../../store/usePdfStore'
import { useCompileStore } from '../../store/useCompileStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import type { SyncTeXLineMapEntry } from '../../../shared/types'

interface PageViewportInfo {
  viewport: { convertToViewportPoint(x: number, y: number): [number, number]; viewBox: number[] }
  element: HTMLDivElement
  pageWidth: number
  pageHeight: number
}

interface UseScrollSyncOptions {
  containerRef: React.RefObject<HTMLDivElement | null>
  pageViewportsRef: React.RefObject<Map<number, PageViewportInfo>>
  containerWidth: number | null
}

/** Debounce delay for scroll sync (ms). */
const DEBOUNCE_MS = 50
/** Cooldown to prevent feedback loops (ms). */
const LOCK_MS = 300

/**
 * Binary search for the largest entry.line <= targetLine.
 * Returns the index, or -1 if no entry qualifies.
 */
function findLineIndex(map: SyncTeXLineMapEntry[], targetLine: number): number {
  let lo = 0
  let hi = map.length - 1
  let best = -1
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    if (map[mid].line <= targetLine) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return best
}

/**
 * Find the line map entry closest to (targetPage, targetY).
 * First filters to entries on the target page, then finds the closest y.
 */
function findEntryByPageY(
  map: SyncTeXLineMapEntry[],
  targetPage: number,
  targetY: number
): SyncTeXLineMapEntry | null {
  let best: SyncTeXLineMapEntry | null = null
  let bestDist = Infinity
  for (const entry of map) {
    if (entry.page !== targetPage) continue
    const dist = Math.abs(entry.y - targetY)
    if (dist < bestDist) {
      bestDist = dist
      best = entry
    }
  }
  return best
}

export function useScrollSync({
  containerRef,
  pageViewportsRef,
  containerWidth
}: UseScrollSyncOptions): void {
  const lineMapRef = useRef<SyncTeXLineMapEntry[]>([])
  const scrollSourceRef = useRef<'editor' | 'pdf' | null>(null)
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Build line map after each compilation
  const pdfRevision = useCompileStore((s) => s.pdfRevision)
  const filePath = useEditorStore((s) => s.filePath)
  const editorInstance = useEditorStore((s) => s.editorInstance)
  const scrollSyncEnabled = useSettingsStore((s) => s.settings.scrollSyncEnabled)

  useEffect(() => {
    if (!scrollSyncEnabled || !filePath || !pdfRevision) {
      lineMapRef.current = []
      return
    }
    if (typeof window.api.synctexBuildLineMap !== 'function') {
      lineMapRef.current = []
      return
    }
    window.api
      .synctexBuildLineMap(filePath)
      .then((map) => {
        lineMapRef.current = map
      })
      .catch(() => {
        lineMapRef.current = []
      })
  }, [pdfRevision, filePath, scrollSyncEnabled])

  // Editor → PDF scroll sync
  useEffect(() => {
    if (!scrollSyncEnabled) return

    const editor = editorInstance
    if (!editor) return

    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const disposable = editor.onDidScrollChange(() => {
      if (scrollSourceRef.current === 'pdf') return

      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        const map = lineMapRef.current
        if (map.length === 0) return

        const container = containerRef.current
        if (!container) return

        const ranges = editor.getVisibleRanges()
        if (!ranges || ranges.length === 0) return
        const topLine = ranges[0].startLineNumber

        const idx = findLineIndex(map, topLine)
        if (idx === -1) return

        const entry = map[idx]
        const info = pageViewportsRef.current?.get(entry.page)
        if (!info || !info.element.isConnected) return

        // Convert SyncTeX y to viewport pixels
        const viewBoxTop = info.viewport.viewBox[3]
        const pdfY = viewBoxTop - entry.y
        const [, vy] = info.viewport.convertToViewportPoint(0, pdfY)

        const containerRect = container.getBoundingClientRect()
        const pageRect = info.element.getBoundingClientRect()
        const pageTop = pageRect.top - containerRect.top + container.scrollTop

        const targetScrollTop = pageTop + vy - containerRect.height / 3

        // Set lock to prevent feedback loop
        scrollSourceRef.current = 'editor'
        if (lockTimerRef.current) clearTimeout(lockTimerRef.current)
        lockTimerRef.current = setTimeout(() => {
          scrollSourceRef.current = null
        }, LOCK_MS)

        container.scrollTo({ top: targetScrollTop, behavior: 'smooth' })
      }, DEBOUNCE_MS)
    })

    return () => {
      disposable.dispose()
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [pdfRevision, containerRef, pageViewportsRef, editorInstance, scrollSyncEnabled])

  // PDF → Editor scroll sync
  useEffect(() => {
    if (!scrollSyncEnabled) return

    const container = containerRef.current
    if (!container) return

    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const handleScroll = (): void => {
      if (scrollSourceRef.current === 'editor') return

      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        const map = lineMapRef.current
        if (map.length === 0) return

        const editor = useEditorStore.getState().editorInstance
        if (!editor) return

        // Find the most visible page
        const containerRect = container.getBoundingClientRect()
        let bestPage: number | null = null
        let bestVisibleArea = 0

        for (const [pageNum, info] of pageViewportsRef.current!) {
          if (!info.element.isConnected) continue
          const rect = info.element.getBoundingClientRect()
          const overlapTop = Math.max(rect.top, containerRect.top)
          const overlapBottom = Math.min(rect.bottom, containerRect.bottom)
          const visibleHeight = Math.max(0, overlapBottom - overlapTop)
          const area =
            visibleHeight *
            Math.max(
              0,
              Math.min(rect.right, containerRect.right) - Math.max(rect.left, containerRect.left)
            )
          if (area > bestVisibleArea) {
            bestVisibleArea = area
            bestPage = pageNum
          }
        }

        if (bestPage === null) return
        const info = pageViewportsRef.current?.get(bestPage)
        if (!info) return

        // Calculate center of visible portion of page
        const pageRect = info.element.getBoundingClientRect()
        const centerY =
          (Math.max(pageRect.top, containerRect.top) +
            Math.min(pageRect.bottom, containerRect.bottom)) /
            2 -
          pageRect.top

        // Convert pixel center to SyncTeX y coordinates
        const zoomLevel = usePdfStore.getState().zoomLevel
        const pw = containerWidth ? (containerWidth - 32) * (zoomLevel / 100) : info.pageWidth
        const scale = pw / info.pageWidth
        const pdfCenterY = centerY / scale // top-down PDF user-space y

        // Convert to SyncTeX coordinate: y = viewBoxTop - pdfCenterY
        const viewBoxTop = info.viewport.viewBox[3]
        const synctexY = viewBoxTop - pdfCenterY

        const entry = findEntryByPageY(map, bestPage, synctexY)
        if (!entry) return

        // Set lock to prevent feedback loop
        scrollSourceRef.current = 'pdf'
        if (lockTimerRef.current) clearTimeout(lockTimerRef.current)
        lockTimerRef.current = setTimeout(() => {
          scrollSourceRef.current = null
        }, LOCK_MS)

        const topForLine = editor.getTopForLineNumber(entry.line)
        editor.setScrollTop(topForLine)
      }, DEBOUNCE_MS)
    }

    container.addEventListener('scroll', handleScroll)
    return () => {
      container.removeEventListener('scroll', handleScroll)
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [pdfRevision, containerRef, pageViewportsRef, containerWidth, scrollSyncEnabled])

  // Cleanup lock timer on unmount
  useEffect(() => {
    return () => {
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current)
    }
  }, [])
}

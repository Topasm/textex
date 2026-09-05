import { useEffect, type RefObject } from 'react'
import { normalizeDocumentId } from '../../models/documentRegistry'
import { useEditorStore } from '../../store/useEditorStore'
import { capturePdfSourceContext, preparePdfSource } from '../../services/pdfSourceNavigation'
import { previewSourceRange } from '../../utils/previewSelection'
import { logError } from '../../utils/errorMessage'

interface SelectionPage {
  element: HTMLDivElement
  pageWidth: number
  pageHeight: number
}

/** Resolve a completed PDF text selection without moving focus out of the PDF. */
export function usePdfSelection(
  containerRef: RefObject<HTMLDivElement | null>,
  pagesRef: RefObject<Map<number, SelectionPage>>,
  displayedRevision: number
): void {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let requestId = 0
    let timer: ReturnType<typeof setTimeout> | null = null

    const synchronize = async (id: number): Promise<void> => {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount !== 1) return
      const range = selection.getRangeAt(0).cloneRange()
      if (!container.contains(range.startContainer) || !container.contains(range.endContainer))
        return
      const text = selection.toString().trim()
      if (selection.isCollapsed || !text) {
        useEditorStore.getState().setPreviewSourceHighlight(null)
        return
      }
      useEditorStore.getState().setPreviewSourceHighlight(null)
      const context = capturePdfSourceContext(displayedRevision)
      if (!context) return
      const { sourcePath } = context

      const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0)
      const endpoint = (node: Node, last: boolean) => {
        for (const [page, info] of pagesRef.current ?? []) {
          if (!info.element.isConnected || !info.element.contains(node)) continue
          if (
            info.element.closest('[data-pdf-generation]')?.getAttribute('data-pdf-generation') !==
            String(displayedRevision)
          )
            continue
          const bounds = info.element.getBoundingClientRect()
          if (bounds.width <= 0 || bounds.height <= 0) return null
          const matches = rects.filter(
            (rect) =>
              rect.bottom > bounds.top &&
              rect.top < bounds.bottom &&
              rect.right > bounds.left &&
              rect.left < bounds.right
          )
          const rect = last ? matches.at(-1) : matches[0]
          if (!rect) return null
          return {
            page,
            x:
              (((last
                ? rect.right - Math.min(1, rect.width / 2)
                : rect.left + Math.min(1, rect.width / 2)) -
                bounds.left) *
                info.pageWidth) /
              bounds.width,
            y: (((rect.top + rect.bottom) / 2 - bounds.top) * info.pageHeight) / bounds.height
          }
        }
        return null
      }
      const start = endpoint(range.startContainer, false)
      const end = endpoint(range.endContainer, true)
      if (!start || !end) return
      const current = () => {
        const selected = window.getSelection()
        return (
          id === requestId &&
          context.isCurrent() &&
          selected?.toString().trim() === text &&
          selected.rangeCount === 1 &&
          selected.getRangeAt(0).startContainer === range.startContainer &&
          selected.getRangeAt(0).startOffset === range.startOffset &&
          selected.getRangeAt(0).endContainer === range.endContainer &&
          selected.getRangeAt(0).endOffset === range.endOffset
        )
      }
      // Native inverse SyncTeX validates the source and resolved target against
      // the active project, including symlink containment.
      const [first, last] = await Promise.all([
        window.api.synctexInverse(sourcePath, start.page, start.x, start.y),
        window.api.synctexInverse(sourcePath, end.page, end.x, end.y)
      ])
      if (
        !current() ||
        !first ||
        !last ||
        normalizeDocumentId(first.file) !== normalizeDocumentId(last.file)
      )
        return
      const prepared = await preparePdfSource(first.file, current)
      if (!prepared) return
      const mappedRange = previewSourceRange(prepared.text, text, first.line, last.line)
      if (!mappedRange) return
      const snapshot = prepared.activate()
      if (!snapshot) return
      useEditorStore.getState().setPreviewSourceHighlight({
        filePath: prepared.filePath,
        revision: snapshot.revision,
        pdfRevision: context.pdfRevision,
        range: mappedRange,
        text
      })
    }

    const schedule = () => {
      const id = ++requestId
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        void synchronize(id).catch((error) => logError('PDF:selection', error))
      }, 100)
    }
    document.addEventListener('selectionchange', schedule)
    container.addEventListener('mouseup', schedule)
    container.addEventListener('keyup', schedule)
    return () => {
      requestId++
      if (timer) clearTimeout(timer)
      document.removeEventListener('selectionchange', schedule)
      container.removeEventListener('mouseup', schedule)
      container.removeEventListener('keyup', schedule)
    }
  }, [containerRef, pagesRef, displayedRevision])
}

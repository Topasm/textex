import { useCallback, useEffect, type MutableRefObject } from 'react'
import type { EditorAdapter } from '../../editor/EditorAdapter'
import { normalizeDocumentId } from '../../models/documentRegistry'
import { useEditorStore } from '../../store/useEditorStore'
import { useCompileStore } from '../../store/useCompileStore'

export function usePreviewSourceHighlight(ref: MutableRefObject<EditorAdapter | null>): () => void {
  const clear = useCallback(() => ref.current?.clearDecorations('preview-selection'), [ref])
  const refresh = useCallback(() => {
    const adapter = ref.current
    if (!adapter) return
    adapter.clearDecorations('preview-selection')
    const state = useEditorStore.getState()
    const highlight = state.previewSourceHighlight
    const documentId = adapter.getDocumentId()
    if (
      !highlight ||
      !documentId ||
      normalizeDocumentId(documentId) !== normalizeDocumentId(highlight.filePath) ||
      state.revision !== highlight.revision ||
      useCompileStore.getState().pdfRevision !== highlight.pdfRevision
    )
      return
    adapter.setDecorations('preview-selection', [
      { range: highlight.range, className: 'editor-preview-selection' }
    ])
    adapter.revealPosition(highlight.range.start, { center: true, focus: false })
  }, [ref])

  useEffect(() => {
    refresh()
    const unsubscribeEditor = useEditorStore.subscribe(
      (state) => [state.previewSourceHighlight, state.filePath, state.revision] as const,
      refresh,
      { equalityFn: (a, b) => a.every((value, index) => value === b[index]) }
    )
    const unsubscribeCompile = useCompileStore.subscribe((state) => state.pdfRevision, refresh)
    return () => {
      unsubscribeEditor()
      unsubscribeCompile()
      clear()
    }
  }, [clear, refresh])
  return refresh
}

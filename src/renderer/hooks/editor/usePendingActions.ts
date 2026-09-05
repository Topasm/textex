import { useCallback, useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'
import type { EditorAdapter } from '../../editor/EditorAdapter'
import { useEditorStore } from '../../store/useEditorStore'
import { useCompileStore } from '../../store/useCompileStore'
import { normalizeDocumentId } from '../../models/documentRegistry'

/**
 * Handles queued editor actions. Call the returned refresh after adapter binding
 * so source jumps can wait for the correct document without a fixed delay.
 */
export function usePendingActions(
  editorAdapterRef: MutableRefObject<EditorAdapter | null>
): () => void {
  const fadeRef = useRef<{ timer: ReturnType<typeof setTimeout>; dispose: () => void } | null>(null)
  const clearFade = useCallback(() => {
    const fade = fadeRef.current
    if (!fade) return
    fadeRef.current = null
    clearTimeout(fade.timer)
    fade.dispose()
  }, [])
  const refresh = useCallback(() => {
    const state = useEditorStore.getState()
    const jump = state.pendingJump
    if (!jump) return
    const target = jump.target
    if (
      target &&
      (normalizeDocumentId(state.filePath ?? '') !== target.documentId ||
        state.revision !== target.revision ||
        state.tabMutationEpoch !== target.tabMutationEpoch ||
        useCompileStore.getState().pdfRevision !== target.pdfRevision)
    ) {
      state.clearPendingJump()
      return
    }
    const adapter = editorAdapterRef.current
    if (
      !adapter ||
      (target && normalizeDocumentId(adapter.getDocumentId() ?? '') !== target.documentId)
    )
      return
    // Consume before moving the cursor, which can synchronously update stores.
    state.clearPendingJump()
    clearFade()
    adapter.revealPosition(
      { line: jump.line, column: jump.column },
      { center: true, focus: !jump.skipFocus }
    )
    const decoration = adapter.setDecorations('pending-jump', [
      {
        range: { start: { line: jump.line, column: 1 }, end: { line: jump.line, column: 1 } },
        isWholeLine: true,
        className: 'editor-flash-line',
        marginClassName: 'editor-flash-gutter'
      }
    ])
    fadeRef.current = { timer: setTimeout(clearFade, 1200), dispose: () => decoration.dispose() }
  }, [editorAdapterRef, clearFade])

  useEffect(() => {
    refresh()
    const unsubscribeEditor = useEditorStore.subscribe(
      (state) =>
        [state.pendingJump, state.filePath, state.revision, state.tabMutationEpoch] as const,
      refresh,
      { equalityFn: (a, b) => a.every((value, index) => value === b[index]) }
    )
    const unsubscribeCompile = useCompileStore.subscribe((state) => state.pdfRevision, refresh)
    return () => {
      unsubscribeEditor()
      unsubscribeCompile()
      clearFade()
    }
  }, [refresh, clearFade])

  useEffect(() => {
    return useEditorStore.subscribe(
      (state) => state.pendingInsertText,
      (pendingInsertText) => {
        if (!pendingInsertText) return
        const editorAdapter = editorAdapterRef.current
        if (!editorAdapter) return

        const position = editorAdapter.getPosition()
        if (position) {
          editorAdapter.applyEdits('pending-insert', [
            {
              range: { start: position, end: position },
              text: pendingInsertText,
              forceMoveMarkers: true
            }
          ])
          editorAdapter.focus()
        }

        useEditorStore.getState().clearPendingInsert()
      }
    )
  }, [editorAdapterRef])
  return refresh
}

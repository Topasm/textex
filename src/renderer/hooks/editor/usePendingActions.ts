import { useEffect } from 'react'
import type { MutableRefObject } from 'react'
import type { EditorAdapter } from '../../editor/EditorAdapter'
import { useEditorStore } from '../../store/useEditorStore'

/**
 * Merged handler for pending jump and pending insert store actions.
 * Combines two separate store subscriptions into a single hook,
 * reducing subscription overhead in EditorPane.
 */
export function usePendingActions(editorAdapterRef: MutableRefObject<EditorAdapter | null>): void {
  useEffect(() => {
    return useEditorStore.subscribe(
      (state) => state.pendingJump,
      (pendingJump) => {
        if (!pendingJump) return
        const editorAdapter = editorAdapterRef.current
        if (!editorAdapter) return

        editorAdapter.revealPosition(
          { line: pendingJump.line, column: pendingJump.column },
          { center: true, focus: !pendingJump.skipFocus }
        )

        const decoration = editorAdapter.setDecorations('pending-jump', [
          {
            range: {
              start: { line: pendingJump.line, column: 1 },
              end: { line: pendingJump.line, column: 1 }
            },
            isWholeLine: true,
            className: 'editor-flash-line',
            marginClassName: 'editor-flash-gutter'
          }
        ])
        setTimeout(() => decoration.dispose(), 1200)

        useEditorStore.getState().clearPendingJump()
      }
    )
  }, [editorAdapterRef])

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
}

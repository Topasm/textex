import { useEffect } from 'react'
import type { MutableRefObject } from 'react'
import type { editor as monacoEditor } from 'monaco-editor'
import { useEditorStore } from '../../store/useEditorStore'

type MonacoInstance = typeof import('monaco-editor')

interface UsePendingActionsParams {
  editorRef: MutableRefObject<monacoEditor.IStandaloneCodeEditor | null>
  monacoRef: MutableRefObject<MonacoInstance | null>
}

/**
 * Merged handler for pending jump and pending insert store actions.
 * Combines two separate store subscriptions into a single hook,
 * reducing subscription overhead in EditorPane.
 */
export function usePendingActions({ editorRef, monacoRef }: UsePendingActionsParams): void {
  // Pending jump subscription
  useEffect(() => {
    return useEditorStore.subscribe(
      (state) => state.pendingJump,
      (pendingJump) => {
        if (!pendingJump) return

        const editor = editorRef.current
        const monaco = monacoRef.current
        if (!editor || !monaco) return

        editor.revealLineInCenter(pendingJump.line)
        editor.setPosition({ lineNumber: pendingJump.line, column: pendingJump.column })
        if (!pendingJump.skipFocus) {
          editor.focus()
        }

        // Flash the target line to draw attention
        const collection = editor.createDecorationsCollection([
          {
            range: new monaco.Range(pendingJump.line, 1, pendingJump.line, 1),
            options: {
              isWholeLine: true,
              className: 'editor-flash-line',
              marginClassName: 'editor-flash-gutter'
            }
          }
        ])
        setTimeout(() => collection.clear(), 1200)

        useEditorStore.getState().clearPendingJump()
      }
    )
  }, [editorRef, monacoRef])

  // Pending insert subscription
  useEffect(() => {
    return useEditorStore.subscribe(
      (state) => state.pendingInsertText,
      (pendingInsertText) => {
        if (!pendingInsertText) return

        const editor = editorRef.current
        const monaco = monacoRef.current
        if (!editor || !monaco) return

        const pos = editor.getPosition()
        if (pos) {
          editor.executeEdits('pending-insert', [
            {
              range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
              text: pendingInsertText,
              forceMoveMarkers: true
            }
          ])
          editor.focus()
        }

        useEditorStore.getState().clearPendingInsert()
      }
    )
  }, [editorRef, monacoRef])
}

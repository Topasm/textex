import { useEffect } from 'react'
import type { MutableRefObject } from 'react'
import type { editor as monacoEditor } from 'monaco-editor'
import { useEditorStore } from '../../store/useEditorStore'

type MonacoInstance = typeof import('monaco-editor')

interface UsePendingInsertParams {
  editorRef: MutableRefObject<monacoEditor.IStandaloneCodeEditor | null>
  monacoRef: MutableRefObject<MonacoInstance | null>
}

export function usePendingInsert({ editorRef, monacoRef }: UsePendingInsertParams): void {
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

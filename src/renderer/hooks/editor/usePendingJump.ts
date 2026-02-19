import { useEffect } from 'react'
import type { MutableRefObject } from 'react'
import type { editor as monacoEditor } from 'monaco-editor'
import { useEditorStore } from '../../store/useEditorStore'

type MonacoInstance = typeof import('monaco-editor')

interface UsePendingJumpParams {
  editorRef: MutableRefObject<monacoEditor.IStandaloneCodeEditor | null>
  monacoRef: MutableRefObject<MonacoInstance | null>
}

export function usePendingJump({ editorRef, monacoRef }: UsePendingJumpParams): void {
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
        editor.focus()

        // Flash the target line to draw attention
        const collection = editor.createDecorationsCollection([
          {
            range: new monaco.Range(pendingJump.line, 1, pendingJump.line, 1),
            options: { isWholeLine: true, className: 'editor-flash-line' }
          }
        ])
        setTimeout(() => collection.clear(), 1000)

        useEditorStore.getState().clearPendingJump()
      }
    )
  }, [editorRef, monacoRef])
}

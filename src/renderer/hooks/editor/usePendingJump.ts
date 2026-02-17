import { useEffect } from 'react'
import type { MutableRefObject } from 'react'
import type { editor as monacoEditor } from 'monaco-editor'
import { useAppStore } from '../../store/useAppStore'

interface UsePendingJumpParams {
  editorRef: MutableRefObject<monacoEditor.IStandaloneCodeEditor | null>
}

export function usePendingJump({ editorRef }: UsePendingJumpParams): void {
  useEffect(() => {
    return useAppStore.subscribe(
      (state) => state.pendingJump,
      (pendingJump) => {
        if (!pendingJump) return

        const editor = editorRef.current
        if (!editor) return

        editor.revealLineInCenter(pendingJump.line)
        editor.setPosition({ lineNumber: pendingJump.line, column: pendingJump.column })
        editor.focus()
        useAppStore.getState().clearPendingJump()
      }
    )
  }, [editorRef])
}

import { useEffect } from 'react'
import type { MutableRefObject } from 'react'
import type { editor as monacoEditor } from 'monaco-editor'
import { useEditorStore } from '../../store/useEditorStore'
import { useCompileStore } from '../../store/useCompileStore'

type MonacoInstance = typeof import('monaco-editor')

function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/')
}

interface UseEditorDiagnosticsParams {
  editorRef: MutableRefObject<monacoEditor.IStandaloneCodeEditor | null>
  monacoRef: MutableRefObject<MonacoInstance | null>
}

export function useEditorDiagnostics({ editorRef, monacoRef }: UseEditorDiagnosticsParams): void {
  useEffect(() => {
    const applyMarkers = (): void => {
      const monaco = monacoRef.current
      const editor = editorRef.current
      if (!monaco || !editor) return

      const model = editor.getModel()
      if (!model) return

      const diagnostics = useCompileStore.getState().diagnostics
      const editorState = useEditorStore.getState()
      const currentFile = editorState.activeFilePath ?? editorState.filePath
      const normalizedCurrent = currentFile ? normalizeFilePath(currentFile) : ''
      const maxLine = model.getLineCount()

      const markers: monacoEditor.IMarkerData[] = diagnostics
        .filter((d) => {
          if (!normalizedCurrent) return false
          return normalizeFilePath(d.file) === normalizedCurrent
        })
        .map((d) => {
          const line = Math.min(Math.max(d.line || 1, 1), maxLine)
          const startColumn = Math.max(d.column ?? 1, 1)
          return {
            severity:
              d.severity === 'error'
                ? monaco.MarkerSeverity.Error
                : d.severity === 'warning'
                  ? monaco.MarkerSeverity.Warning
                  : monaco.MarkerSeverity.Info,
            startLineNumber: line,
            startColumn,
            endLineNumber: line,
            endColumn: model.getLineMaxColumn(line),
            message: d.message
          }
        })

      monaco.editor.setModelMarkers(model, 'latex', markers)
    }

    // Fire immediately
    applyMarkers()

    // Subscribe to both stores
    const unsubCompile = useCompileStore.subscribe(
      (state) => state.diagnostics,
      () => applyMarkers()
    )
    const unsubEditor = useEditorStore.subscribe(
      (state) => ({ activeFilePath: state.activeFilePath, filePath: state.filePath }),
      () => applyMarkers(),
      { equalityFn: (a, b) => a.activeFilePath === b.activeFilePath && a.filePath === b.filePath }
    )

    return () => {
      unsubCompile()
      unsubEditor()
    }
  }, [editorRef, monacoRef])
}

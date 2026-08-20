import { useCallback, useEffect } from 'react'
import type { MutableRefObject } from 'react'
import type { EditorAdapter, EditorDiagnostic } from '../../editor/EditorAdapter'
import { useCompileStore } from '../../store/useCompileStore'
import { useEditorStore } from '../../store/useEditorStore'

function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/')
}

export function useEditorDiagnostics(
  editorAdapterRef: MutableRefObject<EditorAdapter | null>
): () => void {
  const applyMarkers = useCallback((): void => {
    const editorAdapter = editorAdapterRef.current
    if (!editorAdapter) return

    const diagnostics = useCompileStore.getState().diagnostics
    const editorState = useEditorStore.getState()
    const currentFile = editorState.activeFilePath ?? editorState.filePath
    const normalizedCurrent = currentFile ? normalizeFilePath(currentFile) : ''
    const maxLine = editorAdapter.getLineCount()
    if (maxLine === 0) return

    const markers: EditorDiagnostic[] = diagnostics
      .filter((diagnostic) => {
        if (!normalizedCurrent) return false
        return normalizeFilePath(diagnostic.file) === normalizedCurrent
      })
      .map((diagnostic) => {
        const line = Math.min(Math.max(diagnostic.line || 1, 1), maxLine)
        const startColumn = Math.max(diagnostic.column ?? 1, 1)
        return {
          severity:
            diagnostic.severity === 'error' || diagnostic.severity === 'warning'
              ? diagnostic.severity
              : 'info',
          range: {
            start: { line, column: startColumn },
            end: { line, column: editorAdapter.getLineMaxColumn(line) }
          },
          message: diagnostic.message
        }
      })

    editorAdapter.setDiagnostics('latex', markers)
  }, [editorAdapterRef])

  useEffect(() => {
    applyMarkers()

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
  }, [applyMarkers])

  return applyMarkers
}

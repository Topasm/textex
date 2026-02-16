import Editor, { OnMount } from '@monaco-editor/react'
import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { editor as monacoEditor } from 'monaco-editor'

type MonacoInstance = typeof import('monaco-editor')

function EditorPane(): JSX.Element {
  const content = useAppStore((s) => s.content)
  const setContent = useAppStore((s) => s.setContent)
  const setCursorPosition = useAppStore((s) => s.setCursorPosition)
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<MonacoInstance | null>(null)
  const cursorDisposableRef = useRef<{ dispose(): void } | null>(null)
  const mouseDisposableRef = useRef<{ dispose(): void } | null>(null)

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    cursorDisposableRef.current = editor.onDidChangeCursorPosition((e) => {
      setCursorPosition(e.position.lineNumber, e.position.column)
    })

    // Ctrl+Click for forward SyncTeX
    mouseDisposableRef.current = editor.onMouseDown((e) => {
      if (!(e.event.ctrlKey || e.event.metaKey)) return
      if (!e.target.position) return
      const filePath = useAppStore.getState().filePath
      if (!filePath) return
      const line = e.target.position.lineNumber
      window.api.synctexForward(filePath, line).then((result) => {
        if (result) {
          useAppStore.getState().setSynctexHighlight(result)
        }
      })
    })
  }

  useEffect(() => {
    return () => {
      cursorDisposableRef.current?.dispose()
      mouseDisposableRef.current?.dispose()
    }
  }, [])

  // Subscribe to diagnostics → set Monaco markers
  useEffect(() => {
    return useAppStore.subscribe(
      (state) => state.diagnostics,
      (diagnostics) => {
        const monaco = monacoRef.current
        const editor = editorRef.current
        if (!monaco || !editor) return
        const model = editor.getModel()
        if (!model) return

        const markers: monacoEditor.IMarkerData[] = diagnostics.map((d) => ({
          severity: d.severity === 'error'
            ? monaco.MarkerSeverity.Error
            : d.severity === 'warning'
              ? monaco.MarkerSeverity.Warning
              : monaco.MarkerSeverity.Info,
          startLineNumber: d.line,
          startColumn: d.column ?? 1,
          endLineNumber: d.line,
          endColumn: model.getLineMaxColumn(d.line),
          message: d.message
        }))
        monaco.editor.setModelMarkers(model, 'latex', markers)
      },
      { fireImmediately: true }
    )
  }, [])

  // Subscribe to pendingJump → jump editor to line
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
  }, [])

  const handleChange = (value: string | undefined): void => {
    if (value !== undefined) {
      setContent(value)
    }
  }

  return (
    <div style={{ height: '100%' }}>
      <Editor
        height="100%"
        defaultLanguage="latex"
        theme="vs-dark"
        value={content}
        onChange={handleChange}
        onMount={handleEditorDidMount}
        options={{
          wordWrap: 'on',
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          padding: { top: 8 }
        }}
      />
    </div>
  )
}

export default EditorPane

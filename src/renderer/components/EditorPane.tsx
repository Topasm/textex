import Editor, { BeforeMount, OnMount } from '@monaco-editor/react'
import { useEffect, useRef } from 'react'
import { formatLatex } from '../utils/formatter'
import { useAppStore } from '../store/useAppStore'
import { stopLspClient } from '../lsp/lspClient'
import { useClickNavigation } from '../hooks/editor/useClickNavigation'
import { useSpelling } from '../hooks/editor/useSpelling'
import { useDocumentSymbols } from '../hooks/editor/useDocumentSymbols'
import { useCompletion } from '../hooks/editor/useCompletion'
import { useEditorDiagnostics } from '../hooks/editor/useEditorDiagnostics'
import { usePendingJump } from '../hooks/editor/usePendingJump'
import { usePackageDetection } from '../hooks/editor/usePackageDetection'
import type { editor as monacoEditor } from 'monaco-editor'

type MonacoInstance = typeof import('monaco-editor')

function getMonacoTheme(theme: string): string {
  switch (theme) {
    case 'light': return 'ivory-light'
    case 'high-contrast': return 'hc-black'
    default: return 'vs-dark'
  }
}

function EditorPane() {
  const content = useAppStore((s) => s.content)
  const setContent = useAppStore((s) => s.setContent)
  const setCursorPosition = useAppStore((s) => s.setCursorPosition)
  const settings = useAppStore((s) => s.settings)
  const theme = settings.theme
  const fontSize = settings.fontSize
  const spellCheckEnabled = settings.spellCheckEnabled
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<MonacoInstance | null>(null)
  const cursorDisposableRef = useRef<{ dispose(): void } | null>(null)
  const mouseDisposableRef = useRef<{ dispose(): void } | null>(null)
  const completionDisposablesRef = useRef<{ dispose(): void }[]>([])
  const registerClickNavigation = useClickNavigation()
  const { runSpellCheck } = useSpelling({
    content,
    enabled: spellCheckEnabled,
    editorRef,
    monacoRef
  })
  const registerCompletionProviders = useCompletion(runSpellCheck)
  useDocumentSymbols(content)
  useEditorDiagnostics({ editorRef, monacoRef })
  usePendingJump({ editorRef, monacoRef })
  usePackageDetection(content)

  const handleEditorWillMount: BeforeMount = (monaco) => {
    monaco.editor.defineTheme('ivory-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: '', foreground: '3b3530', background: 'faf6f0' },
        { token: 'comment', foreground: '8a7e6e', fontStyle: 'italic' },
        { token: 'keyword', foreground: '7a4a2a' },
        { token: 'string', foreground: '5a7a3a' },
        { token: 'number', foreground: '6a5a8a' },
        { token: 'delimiter', foreground: '6b6158' }
      ],
      colors: {
        'editor.background': '#faf6f0',
        'editor.foreground': '#3b3530',
        'editor.lineHighlightBackground': '#f3ece2',
        'editor.selectionBackground': '#ddd5c8',
        'editor.inactiveSelectionBackground': '#eae3d8',
        'editorCursor.foreground': '#7a6240',
        'editorLineNumber.foreground': '#b0a698',
        'editorLineNumber.activeForeground': '#7a6240',
        'editorIndentGuide.background': '#e5ddd2',
        'editorWidget.background': '#f3ece2',
        'editorWidget.border': '#ddd5c8',
        'editorSuggestWidget.background': '#f3ece2',
        'editorSuggestWidget.border': '#ddd5c8',
        'editorSuggestWidget.selectedBackground': '#ddd5c8',
        'input.background': '#fdf9f4',
        'input.border': '#ddd5c8',
        'scrollbarSlider.background': '#c8bfb260',
        'scrollbarSlider.hoverBackground': '#b0a698',
        'scrollbarSlider.activeBackground': '#9a8e82'
      }
    })
  }

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    cursorDisposableRef.current = editor.onDidChangeCursorPosition((e) => {
      setCursorPosition(e.position.lineNumber, e.position.column)
    })

    mouseDisposableRef.current = registerClickNavigation(editor)
    completionDisposablesRef.current.push(...registerCompletionProviders(editor, monaco))

    // Register Format Command
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, async () => {
      const model = editor.getModel()
      if (!model) return
      const text = model.getValue()
      const formatted = await formatLatex(text)

      editor.executeEdits('prettier', [{
        range: model.getFullModelRange(),
        text: formatted,
        forceMoveMarkers: true
      }])
    })
  }

  useEffect(() => {
    const completionDisposables = completionDisposablesRef
    return () => {
      cursorDisposableRef.current?.dispose()
      mouseDisposableRef.current?.dispose()
      for (const d of completionDisposables.current) d.dispose()
      stopLspClient()
    }
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
        theme={getMonacoTheme(theme === 'system' ? 'light' : theme)} // Fallback for system theme logic
        value={content}
        onChange={handleChange}
        beforeMount={handleEditorWillMount}
        onMount={handleEditorDidMount}
        options={{
          fontSize,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          quickSuggestions: true,
          suggestOnTriggerCharacters: true,
          padding: { top: 8 },
          wordWrap: settings.wordWrap ? 'on' : 'off',
        }}
      />
    </div>
  )
}

export default EditorPane

import Editor, { BeforeMount, OnMount } from '@monaco-editor/react'
import { useEffect, useRef, useState } from 'react'
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
import { TableEditorModal } from './TableEditorModal'
import type { editor as monacoEditor, IDisposable, IRange } from 'monaco-editor'

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
  usePendingJump({ editorRef, monacoRef })
  usePackageDetection(content)

  const [tableModal, setTableModal] = useState<{
    isOpen: boolean
    latex: string
    range: IRange | null
  }>({
    isOpen: false,
    latex: '',
    range: null
  })

  // Disposables for CodeLens and Commands
  const tableEditorDisposablesRef = useRef<IDisposable[]>([])

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

    // Register CodeLens Provider for Table Editor
    const codeLensProvider = monaco.languages.registerCodeLensProvider('latex', {
      provideCodeLenses: (model: monacoEditor.ITextModel) => {
        const text = model.getValue()
        const lenses = []
        const regex = /\\begin{tabular}/g
        let match

        while ((match = regex.exec(text)) !== null) {
          const position = model.getPositionAt(match.index)
          lenses.push({
            range: {
              startLineNumber: position.lineNumber,
              startColumn: 1,
              endLineNumber: position.lineNumber,
              endColumn: 1
            },
            command: {
              id: 'textex.openTableEditor',
              title: '📊 Edit Table Visually',
              arguments: [match.index]
            }
          })
        }
        return { lenses, dispose: () => { } }
      }
    })
    tableEditorDisposablesRef.current.push(codeLensProvider)

    // Register Command for Opening Table Editor
    // We use a unique command ID to avoid conflicts if multiple editors were present,
    // though here we assume 'textex.openTableEditor' is fine for the singleton editor pane.
    // If it already exists, it might warn, but we dispose it on unmount.

    // Check if command exists to avoid error on remount if not disposed properly (though we do dispose)
    // Monaco doesn't expose hasCommand easily, so we just try to register.
    // However, registerCommand is global. If we have multiple instances, this is tricky.
    // For now, simple registration.
    const command = monaco.editor.registerCommand('textex.openTableEditor', (_: any, startIndex: number) => {
      const model = editor.getModel()
      if (!model) return

      const text = model.getValue()
      // Find the end of the tabular environment
      // Simple heuristic: matching end{tabular} after startIndex
      const tail = text.slice(startIndex)
      const endMatch = tail.match(/\\end{tabular}/)

      if (endMatch && endMatch.index !== undefined) {
        const endIndex = startIndex + endMatch.index + endMatch[0].length
        const range = {
          startLineNumber: model.getPositionAt(startIndex).lineNumber,
          startColumn: model.getPositionAt(startIndex).column,
          endLineNumber: model.getPositionAt(endIndex).lineNumber,
          endColumn: model.getPositionAt(endIndex).column
        }
        const tableLatex = text.slice(startIndex, endIndex)

        setTableModal({
          isOpen: true,
          latex: tableLatex,
          range
        })
      }
    })
    tableEditorDisposablesRef.current.push(command)
  }

  useEffect(() => {
    const completionDisposables = completionDisposablesRef
    return () => {
      cursorDisposableRef.current?.dispose()
      mouseDisposableRef.current?.dispose()
      for (const d of completionDisposables.current) d.dispose()
      for (const d of tableEditorDisposablesRef.current) d.dispose()
      stopLspClient()
    }
  }, [])

  const handleChange = (value: string | undefined): void => {
    if (value !== undefined) {
      setContent(value)
    }
  }

  return (
    <>
      <div
        style={{ height: '100%' }}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }}
        onDrop={(e) => {
          e.preventDefault()
          const text = e.dataTransfer.getData('text/plain')
          const editor = editorRef.current
          const monaco = monacoRef.current
          if (!text || !editor || !monaco) return

          const target = editor.getTargetAtClientPoint(e.clientX, e.clientY)
          if (target?.position) {
            const pos = target.position
            editor.executeEdits('bib-drop', [{
              range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
              text,
              forceMoveMarkers: true,
            }])
            editor.setPosition(pos)
            editor.focus()
          }
        }}
      >
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
            dropIntoEditor: { enabled: false },
          }}
        />
      </div>
      {tableModal.isOpen && (
        <TableEditorModal
          initialLatex={tableModal.latex}
          onClose={() => setTableModal(prev => ({ ...prev, isOpen: false }))}
          onApply={(newLatex) => {
            if (editorRef.current && tableModal.range) {
              editorRef.current.executeEdits('table-editor', [{
                range: tableModal.range,
                text: newLatex,
                forceMoveMarkers: true
              }])
              setTableModal(prev => ({ ...prev, isOpen: false }))
            }
          }}
        />
      )}
    </>
  )
}

export default EditorPane

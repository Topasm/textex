import Editor, { OnMount } from '@monaco-editor/react'
import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import { snippets } from '../data/snippets'
import type { editor as monacoEditor } from 'monaco-editor'

type MonacoInstance = typeof import('monaco-editor')

function getMonacoTheme(theme: string): string {
  switch (theme) {
    case 'light': return 'vs'
    case 'high-contrast': return 'hc-black'
    default: return 'vs-dark'
  }
}

function EditorPane(): JSX.Element {
  const content = useAppStore((s) => s.content)
  const setContent = useAppStore((s) => s.setContent)
  const setCursorPosition = useAppStore((s) => s.setCursorPosition)
  const theme = useAppStore((s) => s.theme)
  const fontSize = useAppStore((s) => s.fontSize)
  const spellCheckEnabled = useAppStore((s) => s.spellCheckEnabled)
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<MonacoInstance | null>(null)
  const cursorDisposableRef = useRef<{ dispose(): void } | null>(null)
  const mouseDisposableRef = useRef<{ dispose(): void } | null>(null)
  const spellTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const completionDisposablesRef = useRef<{ dispose(): void }[]>([])

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

    // Register LaTeX snippet completion provider
    const snippetDisposable = monaco.languages.registerCompletionItemProvider('latex', {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn
        }
        const suggestions = snippets.map((s) => ({
          label: s.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: s.body,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: s.description,
          detail: `[${s.category}] ${s.prefix}`,
          range,
          filterText: s.prefix
        }))
        return { suggestions }
      }
    })
    completionDisposablesRef.current.push(snippetDisposable)

    // Register citation completion provider (triggers inside \cite{})
    const citeDisposable = monaco.languages.registerCompletionItemProvider('latex', {
      triggerCharacters: ['{', ','],
      provideCompletionItems: (model, position) => {
        const lineContent = model.getLineContent(position.lineNumber)
        const textBefore = lineContent.substring(0, position.column - 1)
        // Check if inside \cite{...}, \citep{...}, \citet{...}, etc.
        const citeMatch = textBefore.match(/\\cite[tp]?\*?\{([^}]*)$/)
        if (!citeMatch) return { suggestions: [] }

        const bibEntries = useAppStore.getState().bibEntries
        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn
        }

        const suggestions = bibEntries.map((entry) => ({
          label: entry.key,
          kind: monaco.languages.CompletionItemKind.Reference,
          insertText: entry.key,
          documentation: `${entry.author} (${entry.year})\n${entry.title}`,
          detail: entry.type,
          range
        }))
        return { suggestions }
      }
    })
    completionDisposablesRef.current.push(citeDisposable)

    // Register spell check code action provider
    const codeActionDisposable = monaco.languages.registerCodeActionProvider('latex', {
      provideCodeActions: async (model, range, context) => {
        const spellMarkers = context.markers.filter((m) => m.source === 'spellcheck')
        if (spellMarkers.length === 0) return { actions: [], dispose: () => {} }

        const actions: monacoEditor.ICodeAction[] = []
        for (const marker of spellMarkers) {
          const word = model.getValueInRange({
            startLineNumber: marker.startLineNumber,
            startColumn: marker.startColumn,
            endLineNumber: marker.endLineNumber,
            endColumn: marker.endColumn
          })
          try {
            const suggestions = await window.api.spellSuggest(word)
            for (const suggestion of suggestions) {
              actions.push({
                title: `Change to "${suggestion}"`,
                kind: 'quickfix',
                edit: {
                  edits: [
                    {
                      resource: model.uri,
                      textEdit: {
                        range: {
                          startLineNumber: marker.startLineNumber,
                          startColumn: marker.startColumn,
                          endLineNumber: marker.endLineNumber,
                          endColumn: marker.endColumn
                        },
                        text: suggestion
                      },
                      versionId: model.getVersionId()
                    }
                  ]
                }
              })
            }
            actions.push({
              title: `Add "${word}" to dictionary`,
              kind: 'quickfix',
              command: {
                id: 'spellcheck.addWord',
                title: `Add "${word}"`,
                arguments: [word]
              }
            })
          } catch {
            // ignore
          }
        }
        return { actions, dispose: () => {} }
      }
    })
    completionDisposablesRef.current.push(codeActionDisposable)

    // Register addWord command
    editor.addCommand(0, async (...args: unknown[]) => {
      const word = args[0] as string
      if (word) {
        await window.api.spellAddWord(word)
        // Re-run spell check
        runSpellCheck(editor, monaco)
      }
    })
  }

  const runSpellCheck = async (
    editor: monacoEditor.IStandaloneCodeEditor,
    monaco: MonacoInstance
  ): Promise<void> => {
    const model = editor.getModel()
    if (!model) return
    if (!useAppStore.getState().spellCheckEnabled) {
      // Clear spell check markers
      const existing = monaco.editor.getModelMarkers({ owner: 'spellcheck' })
      if (existing.length > 0) {
        monaco.editor.setModelMarkers(model, 'spellcheck', [])
      }
      return
    }

    const text = model.getValue()
    // Extract words, skipping LaTeX commands and math mode
    const words: { word: string; line: number; col: number }[] = []
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i]
      // Skip comments
      const commentIdx = line.indexOf('%')
      if (commentIdx >= 0) line = line.substring(0, commentIdx)
      // Skip commands and their arguments (simple heuristic)
      line = line.replace(/\\[a-zA-Z]+(\[[^\]]*\])?(\{[^}]*\})?/g, (m) => ' '.repeat(m.length))
      // Skip math mode
      line = line.replace(/\$[^$]*\$/g, (m) => ' '.repeat(m.length))
      // Extract words
      const wordRegex = /[a-zA-Z']+/g
      let match: RegExpExecArray | null
      while ((match = wordRegex.exec(line)) !== null) {
        if (match[0].length >= 2) {
          words.push({ word: match[0], line: i + 1, col: match.index + 1 })
        }
      }
    }

    if (words.length === 0) return

    try {
      const misspelled = await window.api.spellCheck(words.map((w) => w.word))
      const misspelledSet = new Set(misspelled.map((w) => w.toLowerCase()))
      const markers: monacoEditor.IMarkerData[] = words
        .filter((w) => misspelledSet.has(w.word.toLowerCase()))
        .map((w) => ({
          severity: monaco.MarkerSeverity.Info,
          startLineNumber: w.line,
          startColumn: w.col,
          endLineNumber: w.line,
          endColumn: w.col + w.word.length,
          message: `"${w.word}" may be misspelled`,
          source: 'spellcheck'
        }))
      monaco.editor.setModelMarkers(model, 'spellcheck', markers)
    } catch {
      // ignore spell check errors
    }
  }

  useEffect(() => {
    return () => {
      cursorDisposableRef.current?.dispose()
      mouseDisposableRef.current?.dispose()
      for (const d of completionDisposablesRef.current) d.dispose()
    }
  }, [])

  // Subscribe to diagnostics -> set Monaco markers
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
          severity:
            d.severity === 'error'
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

  // Subscribe to pendingJump -> jump editor to line
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

  // Debounced spell check on content change
  useEffect(() => {
    if (!spellCheckEnabled) return
    clearTimeout(spellTimerRef.current)
    spellTimerRef.current = setTimeout(() => {
      const editor = editorRef.current
      const monaco = monacoRef.current
      if (editor && monaco) runSpellCheck(editor, monaco)
    }, 500)
    return () => clearTimeout(spellTimerRef.current)
  }, [content, spellCheckEnabled])

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
        theme={getMonacoTheme(theme)}
        value={content}
        onChange={handleChange}
        onMount={handleEditorDidMount}
        options={{
          wordWrap: 'on',
          minimap: { enabled: false },
          fontSize,
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

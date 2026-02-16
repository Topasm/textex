import Editor, { BeforeMount, OnMount } from '@monaco-editor/react'
import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import { snippets } from '../data/snippets'
import { environments } from '../data/environments'
import { registerHoverProvider } from '../providers/hoverProvider'
import type { editor as monacoEditor } from 'monaco-editor'

type MonacoInstance = typeof import('monaco-editor')

/**
 * Extract the specific argument under cursor for a LaTeX command.
 * Handles comma-separated keys like \cite{k1,k2}.
 * Returns the key under cursor or null.
 */
function findCommandArgAtPosition(
  lineContent: string,
  column: number,
  cmdRegex: RegExp
): string | null {
  const col = column - 1
  let match: RegExpExecArray | null
  cmdRegex.lastIndex = 0
  while ((match = cmdRegex.exec(lineContent)) !== null) {
    const fullStart = match.index
    const fullEnd = fullStart + match[0].length
    if (col >= fullStart && col <= fullEnd) {
      const argsStr = match[1]
      const argsStart = match[0].indexOf(argsStr) + fullStart
      const keys = argsStr.split(',')
      let offset = argsStart
      for (const key of keys) {
        const trimmed = key.trim()
        const keyStart = offset + key.indexOf(trimmed)
        const keyEnd = keyStart + trimmed.length
        if (col >= keyStart && col <= keyEnd) {
          return trimmed
        }
        offset += key.length + 1
      }
      return keys[0]?.trim() || null
    }
  }
  return null
}

function getMonacoTheme(theme: string): string {
  switch (theme) {
    case 'light': return 'ivory-light'
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

    // Ctrl+Click: Go to Definition / Forward SyncTeX
    mouseDisposableRef.current = editor.onMouseDown((e) => {
      if (!(e.event.ctrlKey || e.event.metaKey)) return
      if (!e.target.position) return
      const state = useAppStore.getState()
      const currentFilePath = state.filePath
      if (!currentFilePath) return

      const model = editor.getModel()
      if (!model) return
      const lineContent = model.getLineContent(e.target.position.lineNumber)
      const col = e.target.position.column

      // 1. \ref{label} → jump to label definition
      const refKey = findCommandArgAtPosition(lineContent, col, /\\(?:ref|eqref|autoref|pageref|cref|Cref|nameref)\{([^}]+)\}/g)
      if (refKey) {
        const label = state.labels.find((l) => l.label === refKey)
        if (label) {
          window.api.readFile(label.file).then((result) => {
            useAppStore.getState().openFileInTab(result.filePath, result.content)
            setTimeout(() => useAppStore.getState().requestJumpToLine(label.line, 1), 50)
          }).catch(() => {})
          return
        }
      }

      // 2. \cite{key} → jump to bib file
      const citeKey = findCommandArgAtPosition(lineContent, col, /\\cite[tp]?\*?\{([^}]+)\}/g)
      if (citeKey) {
        const entry = state.bibEntries.find((b) => b.key === citeKey)
        if (entry?.file) {
          window.api.readFile(entry.file).then((result) => {
            useAppStore.getState().openFileInTab(result.filePath, result.content)
            if (entry.line) {
              setTimeout(() => useAppStore.getState().requestJumpToLine(entry.line!, 1), 50)
            }
          }).catch(() => {})
          return
        }
      }

      // 3. \input{file} / \include{file} → open file
      const inputFile = findCommandArgAtPosition(lineContent, col, /\\(?:input|include)\{([^}]+)\}/g)
      if (inputFile && state.projectRoot) {
        let resolvedPath = inputFile
        if (!resolvedPath.endsWith('.tex')) resolvedPath += '.tex'
        // Resolve relative to project root
        const fullPath = resolvedPath.startsWith('/')
          ? resolvedPath
          : `${state.projectRoot}/${resolvedPath}`
        window.api.readFile(fullPath).then((result) => {
          useAppStore.getState().openFileInTab(result.filePath, result.content)
        }).catch(() => {})
        return
      }

      // 4. Fall through to SyncTeX forward
      const line = e.target.position.lineNumber
      window.api.synctexForward(currentFilePath, line).then((result) => {
        if (result) {
          useAppStore.getState().setSynctexHighlight(result)
        }
      })
    })

    // Register LaTeX snippet + package macro completion provider
    const snippetDisposable = monaco.languages.registerCompletionItemProvider('latex', {
      triggerCharacters: ['\\'],
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

        // Merge package macros
        const packageData = useAppStore.getState().packageData
        const seenNames = new Set(snippets.map((s) => s.prefix))
        for (const [pkgName, pkg] of Object.entries(packageData)) {
          for (const macro of pkg.macros) {
            if (seenNames.has(macro.name)) continue
            seenNames.add(macro.name)
            suggestions.push({
              label: `\\${macro.name}`,
              kind: monaco.languages.CompletionItemKind.Function,
              insertText: macro.snippet
                ? `\\\\${macro.snippet}`
                : `\\\\${macro.name}`,
              insertTextRules: macro.snippet
                ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                : 0 as never,
              documentation: macro.detail || `From package: ${pkgName}`,
              detail: `[${pkgName}]`,
              range,
              filterText: macro.name
            })
          }
        }

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

    // Register label completion provider (triggers inside \ref{}, \eqref{}, etc.)
    const refDisposable = monaco.languages.registerCompletionItemProvider('latex', {
      triggerCharacters: ['{', ','],
      provideCompletionItems: (model, position) => {
        const lineContent = model.getLineContent(position.lineNumber)
        const textBefore = lineContent.substring(0, position.column - 1)
        const refMatch = textBefore.match(/\\(?:ref|eqref|autoref|pageref|cref|Cref|nameref)\{([^}]*)$/)
        if (!refMatch) return { suggestions: [] }

        const labels = useAppStore.getState().labels
        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn
        }

        const suggestions = labels.map((info) => ({
          label: info.label,
          kind: monaco.languages.CompletionItemKind.Reference,
          insertText: info.label,
          documentation: `${info.file}:${info.line}\n${info.context}`,
          detail: `Label (${info.file.split('/').pop()}:${info.line})`,
          range
        }))
        return { suggestions }
      }
    })
    completionDisposablesRef.current.push(refDisposable)

    // Register environment completion provider (triggers on \begin{)
    const envDisposable = monaco.languages.registerCompletionItemProvider('latex', {
      triggerCharacters: ['{'],
      provideCompletionItems: (model, position) => {
        const lineContent = model.getLineContent(position.lineNumber)
        const textBefore = lineContent.substring(0, position.column - 1)
        if (!textBefore.match(/\\begin\{[^}]*$/)) return { suggestions: [] }

        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn
        }

        // Also merge package environments
        const packageData = useAppStore.getState().packageData
        const allEnvs = [...environments]
        for (const pkg of Object.values(packageData)) {
          for (const env of pkg.envs) {
            if (!allEnvs.some((e) => e.name === env.name)) {
              allEnvs.push(env)
            }
          }
        }

        const suggestions = allEnvs.map((env) => {
          const argPart = env.argSnippet || ''
          const snippet = `${env.name}}${argPart}\n\t$0\n\\\\end{${env.name}}`
          return {
            label: env.name,
            kind: monaco.languages.CompletionItemKind.Module,
            insertText: snippet,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: `\\begin{${env.name}}...\\end{${env.name}}`,
            detail: 'Environment',
            range
          }
        })
        return { suggestions }
      }
    })
    completionDisposablesRef.current.push(envDisposable)

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

    // Register hover provider for math preview and citation info
    const hoverDisposable = registerHoverProvider(monaco, {
      getLabels: () => useAppStore.getState().labels,
      getBibEntries: () => useAppStore.getState().bibEntries
    })
    completionDisposablesRef.current.push(hoverDisposable)
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

  // Debounced package detection and loading
  useEffect(() => {
    const timer = setTimeout(() => {
      const currentContent = useAppStore.getState().content
      const pkgRegex = /\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/g
      const packages = new Set<string>()
      let pkgMatch: RegExpExecArray | null
      while ((pkgMatch = pkgRegex.exec(currentContent)) !== null) {
        pkgMatch[1].split(',').forEach((p) => packages.add(p.trim()))
      }
      const pkgArray = Array.from(packages).sort()
      const current = useAppStore.getState().detectedPackages
      if (JSON.stringify(pkgArray) !== JSON.stringify(current)) {
        useAppStore.getState().setDetectedPackages(pkgArray)
        if (pkgArray.length > 0) {
          window.api.loadPackageData(pkgArray).then((data) => {
            useAppStore.getState().setPackageData(data)
          }).catch(() => {})
        } else {
          useAppStore.getState().setPackageData({})
        }
      }
    }, 1500)
    return () => clearTimeout(timer)
  }, [content])

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
        beforeMount={handleEditorWillMount}
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

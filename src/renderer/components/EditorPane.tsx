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
import { useMathPreview } from '../hooks/editor/useMathPreview'
import { useSmartImageDrop } from '../hooks/editor/useSmartImageDrop'
import { useSectionHighlight } from '../hooks/editor/useSectionHighlight'
import { TableEditorModal } from './TableEditorModal'
import { MathPreviewWidget } from './MathPreviewWidget'
import { HistoryPanel } from './HistoryPanel'
import { HistoryItem } from '../../shared/types'
import { DiffEditor } from '@monaco-editor/react'
import type { editor as monacoEditor, IDisposable, IRange } from 'monaco-editor'
import { registerAiActions } from './editor/editorAiActions'
import { registerTableEditorCodeLens } from './editor/editorCodeLens'

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
  const mathPreviewEnabled = settings.mathPreviewEnabled !== false
  const aiEnabled = !!settings.aiEnabled && !!settings.aiProvider
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<MonacoInstance | null>(null)
  const cursorDisposableRef = useRef<{ dispose(): void } | null>(null)
  const mouseDisposableRef = useRef<{ dispose(): void } | null>(null)
  const completionDisposablesRef = useRef<{ dispose(): void }[]>([])
  const aiEnabledKeyRef = useRef<{ set(value: boolean): void } | null>(null)
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
  const mathData = useMathPreview({ editorRef, enabled: mathPreviewEnabled })
  useSectionHighlight({ editorRef, monacoRef })
  const { handleDrop: handleSmartImageDrop } = useSmartImageDrop()
  const [showMathPreview, setShowMathPreview] = useState(true)
  const prevMathRangeRef = useRef<string | null>(null)

  // Re-show the preview when the cursor moves to a different math expression
  useEffect(() => {
    const rangeKey = mathData
      ? `${mathData.range.startLineNumber}:${mathData.range.startColumn}-${mathData.range.endLineNumber}:${mathData.range.endColumn}`
      : null
    if (rangeKey !== prevMathRangeRef.current) {
      setShowMathPreview(true)
      prevMathRangeRef.current = rangeKey
    }
  }, [mathData])

  const [tableModal, setTableModal] = useState<{
    isOpen: boolean
    latex: string
    range: IRange | null
  }>({
    isOpen: false,
    latex: '',
    range: null
  })

  // History State
  const [showHistory, setShowHistory] = useState(false)
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([])
  const [snapshotContent, setSnapshotContent] = useState('')
  const [historyMode, setHistoryMode] = useState(false) // true if viewing a snapshot diff

  // Disposables for CodeLens and Commands
  const tableEditorDisposablesRef = useRef<IDisposable[]>([])

  const handleEditorWillMount: BeforeMount = (monaco) => {
    // Register LaTeX language with Monarch tokenizer for syntax highlighting
    monaco.languages.register({ id: 'latex' })
    monaco.languages.setMonarchTokensProvider('latex', {
      defaultToken: '',
      tokenPostfix: '.latex',

      brackets: [
        { open: '{', close: '}', token: 'delimiter.curly' },
        { open: '[', close: ']', token: 'delimiter.square' },
        { open: '(', close: ')', token: 'delimiter.parenthesis' },
      ],

      tokenizer: {
        root: [
          // Comments
          [/%.*$/, 'comment'],

          // Begin/end environments
          [/(\\(?:begin|end))(\{)([^}]*)(\})/, ['keyword', 'delimiter.curly', 'variable', 'delimiter.curly']],

          // Section commands
          [/\\(?:part|chapter|(?:sub){0,2}section|(?:sub)?paragraph)\b\*?/, 'keyword'],

          // Common keyword commands
          [/\\(?:documentclass|usepackage|input|include|bibliography|bibliographystyle|newcommand|renewcommand|newenvironment|renewenvironment|def|let|newtheorem|theoremstyle|makeatletter|makeatother|maketitle|tableofcontents|listoffigures|listoftables)\b\*?/, 'keyword'],

          // Formatting commands
          [/\\(?:textbf|textit|texttt|textsc|textrm|textsf|textup|textmd|emph|underline|sout|textsubscript|textsuperscript|footnote|endnote|caption|label|ref|eqref|cite|citep|citet|citeauthor|citeyear|nocite|pageref|autoref|nameref|href|url)\b\*?/, 'keyword'],

          // Math environment commands
          [/\\(?:left|right|big|Big|bigg|Bigg)\b/, 'keyword.math'],

          // Control sequences (general commands)
          [/\\[a-zA-Z@]+\*?/, 'tag'],

          // Control symbols (single char after backslash)
          [/\\[^a-zA-Z]/, 'tag'],

          // Inline math $...$
          [/\$\$/, { token: 'string.math', next: '@displaymath' }],
          [/\$/, { token: 'string.math', next: '@inlinemath' }],

          // Braces and brackets
          [/[{}]/, 'delimiter.curly'],
          [/\[/, 'delimiter.square'],
          [/\]/, 'delimiter.square'],

          // Special characters
          [/[&~#^_]/, 'keyword'],

          // Numbers
          [/\d+(\.\d+)?/, 'number'],
        ],

        inlinemath: [
          [/[^\\$]+/, 'string.math'],
          [/\\[a-zA-Z@]+\*?/, 'string.math'],
          [/\\[^a-zA-Z]/, 'string.math'],
          [/\$/, { token: 'string.math', next: '@pop' }],
        ],

        displaymath: [
          [/[^\\$]+/, 'string.math'],
          [/\\[a-zA-Z@]+\*?/, 'string.math'],
          [/\\[^a-zA-Z]/, 'string.math'],
          [/\$\$/, { token: 'string.math', next: '@pop' }],
        ],
      },
    })

    // Also register bibtex language
    monaco.languages.register({ id: 'bibtex' })
    monaco.languages.setMonarchTokensProvider('bibtex', {
      defaultToken: '',
      tokenPostfix: '.bibtex',

      tokenizer: {
        root: [
          [/%.*$/, 'comment'],
          [/@[a-zA-Z]+/, 'keyword'],
          [/[{}]/, 'delimiter.curly'],
          [/=/, 'delimiter'],
          [/"[^"]*"/, 'string'],
          [/\{[^}]*\}/, 'string'],
          [/,/, 'delimiter'],
          [/\d+/, 'number'],
        ],
      },
    })

    // Set LaTeX language configuration (comment toggling, brackets, etc.)
    monaco.languages.setLanguageConfiguration('latex', {
      comments: {
        lineComment: '%',
      },
      brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')'],
      ],
      autoClosingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '$', close: '$' },
      ],
      surroundingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '$', close: '$' },
      ],
    })

    monaco.editor.defineTheme('ivory-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: '', foreground: '3b3530', background: 'faf6f0' },
        { token: 'comment', foreground: '8a7e6e', fontStyle: 'italic' },
        { token: 'keyword', foreground: '7a4a2a' },
        { token: 'keyword.math', foreground: '7a4a2a' },
        { token: 'tag', foreground: '2a6a7a' },
        { token: 'variable', foreground: '6a3a7a' },
        { token: 'string', foreground: '5a7a3a' },
        { token: 'string.math', foreground: '5a7a3a' },
        { token: 'number', foreground: '6a5a8a' },
        { token: 'delimiter', foreground: '6b6158' },
        { token: 'delimiter.curly', foreground: '6b6158' },
        { token: 'delimiter.square', foreground: '6b6158' },
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
    // Create context key for AI enabled state
    aiEnabledKeyRef.current = editor.createContextKey('textex.aiEnabled', aiEnabled)
    monacoRef.current = monaco
    cursorDisposableRef.current = editor.onDidChangeCursorPosition((e) => {
      setCursorPosition(e.position.lineNumber, e.position.column)
    })

    mouseDisposableRef.current = registerClickNavigation(editor)
    completionDisposablesRef.current.push(...registerCompletionProviders(editor, monaco))

    // Register Sync Search Command (Ctrl+F)
    // This triggers BOTH the editor's find widget AND the PDF search bar
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
      const selection = editor.getSelection()
      const model = editor.getModel()
      const store = useAppStore.getState()

      store.setPdfSearchVisible(true)

      if (selection && model && !selection.isEmpty()) {
        const text = model.getValueInRange(selection)
        // Only update query if text is selected, otherwise keep previous query or empty
        if (text.trim().length > 0) {
          store.setPdfSearchQuery(text)
        }
      }

      // Trigger the default find widget so user can search code too
      editor.trigger('source', 'actions.find', {})
    })

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

    // Register CodeLens + command for table editor
    tableEditorDisposablesRef.current.push(
      ...registerTableEditorCodeLens(editor, monaco, setTableModal)
    )

    // Register Insert User Info Command
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyI, () => {
      const settings = useAppStore.getState().settings
      const userInfo = `
% User Information
% Name: ${settings.name}
% Email: ${settings.email}
% Affiliation: ${settings.affiliation}
\\author{${settings.name}${settings.affiliation ? ` \\\\ ${settings.affiliation}` : ''}${settings.email ? ` \\\\ \\texttt{${settings.email}}` : ''}}
`
      const position = editor.getPosition()
      if (position) {
        editor.executeEdits('insert-user-info', [{
          range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
          text: userInfo,
          forceMoveMarkers: true
        }])
      }
    })

    // Register AI Actions (extracted to editorAiActions.ts)
    registerAiActions(editor)

    // Register Toggle History Command
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyH, () => {
      setShowHistory(prev => !prev);
      // Reset history mode when closing
      if (showHistory) setHistoryMode(false);
    });

    // Filter command palette: remove IDE actions not relevant for LaTeX editing
    const hiddenActions = new Set([
      // Go-to / peek / references (not useful without full LSP)
      'editor.action.goToDeclaration',
      'editor.action.goToImplementation',
      'editor.action.goToReferences',
      'editor.action.goToTypeDefinition',
      'editor.action.peekDefinition',
      'editor.action.peekImplementation',
      'editor.action.peekReferences',
      'editor.action.peekTypeDefinition',
      'editor.action.revealDefinition',
      'editor.action.revealDeclaration',
      'editor.action.referenceSearch.trigger',
      'editor.action.showDefinitionPreviewHover',
      // Refactoring / code actions
      'editor.action.rename',
      'editor.action.refactor',
      'editor.action.sourceAction',
      'editor.action.organizeImports',
      'editor.action.autoFix',
      'editor.action.fixAll',
      'editor.action.codeAction',
      'editor.action.quickFix',
      // Suggestions / hints not relevant
      'editor.action.triggerParameterHints',
      'editor.action.inlineSuggest.trigger',
      'editor.action.inlineSuggest.commit',
      'editor.action.inlineSuggest.hide',
      'editor.action.inlineSuggest.showNext',
      'editor.action.inlineSuggest.showPrevious',
      // Debug / internal
      'editor.action.inspectTokens',
      'editor.action.forceRetokenize',
      'editor.action.toggleTabFocusMode',
      'editor.action.toggleRenderWhitespace',
      'editor.action.accessibilityHelp',
      'editor.action.showAccessibilityHelp',
      // Quick outline (no symbol provider for LaTeX by default)
      'editor.action.quickOutline',
      // Linked editing (for HTML-like tag renaming)
      'editor.action.linkedEditing',
      // Format (we have our own Shift+Alt+F formatter)
      'editor.action.formatDocument',
      'editor.action.formatSelection',
      // Hover
      'editor.action.showHover',
    ])

    const editorAny = editor as unknown as {
      getSupportedActions(): { id: string }[]
    }
    if (typeof editorAny.getSupportedActions === 'function') {
      const origGetSupportedActions = editorAny.getSupportedActions.bind(editorAny)
      editorAny.getSupportedActions = () => {
        return origGetSupportedActions().filter(a => !hiddenActions.has(a.id))
      }
    }
  }

  // Keep the aiEnabled context key in sync with settings
  useEffect(() => {
    if (aiEnabledKeyRef.current) {
      aiEnabledKeyRef.current.set(aiEnabled)
    }
  }, [aiEnabled])

  useEffect(() => {
    const completionDisposables = completionDisposablesRef
    const tableEditorDisposables = tableEditorDisposablesRef.current
    return () => {
      cursorDisposableRef.current?.dispose()
      mouseDisposableRef.current?.dispose()
      for (const d of completionDisposables.current) d.dispose()
      for (const d of tableEditorDisposables) d.dispose()
      stopLspClient()
    }
  }, [])

  useEffect(() => {
    if (showHistory) {
      const activeFilePath = useAppStore.getState().activeFilePath;
      if (activeFilePath) {
        window.api.getHistoryList(activeFilePath).then(setHistoryItems);
      }
    }
  }, [showHistory]);

  const handleSelectHistoryItem = async (item: HistoryItem) => {
    try {
      const content = await window.api.loadHistorySnapshot(item.path);
      setSnapshotContent(content);
      setHistoryMode(true);
    } catch (err) {
      console.error(err);
      alert('Failed to load snapshot');
    }
  };

  const handleChange = (value: string | undefined): void => {
    if (value !== undefined) {
      setContent(value)
    }
  }

  return (
    <>
      <div
        style={{ height: '100%', display: 'flex' }}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }}
        onDrop={async (e) => {
          e.preventDefault()

          // Try smart image drop first
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            await handleSmartImageDrop(e, editorRef.current, monacoRef.current)
            return
          }

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
        <div style={{ flex: 1, position: 'relative' }}>
          {historyMode ? (
            <DiffEditor
              height="100%"
              language="latex"
              theme={getMonacoTheme(theme === 'system' ? 'light' : theme)}
              original={snapshotContent}
              modified={content}
              options={{
                fontSize,
                readOnly: true,
                originalEditable: false,
                wordWrap: settings.wordWrap ? 'on' : 'off'
              }}
            />
          ) : (
            <Editor
              height="100%"
              defaultLanguage="latex"
              theme={getMonacoTheme(theme === 'system' ? 'light' : theme)}
              value={content}
              onChange={handleChange}
              beforeMount={handleEditorWillMount}
              onMount={handleEditorDidMount}
              options={{
                fontSize,
                lineNumbers: settings.lineNumbers !== false ? 'on' : 'off',
                minimap: { enabled: !!settings.minimap },
                tabSize: settings.tabSize ?? 4,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                quickSuggestions: true,
                suggestOnTriggerCharacters: true,
                padding: { top: 8 },
                wordWrap: settings.wordWrap ? 'on' : 'off',
                dropIntoEditor: { enabled: false },
              }}
            />
          )}
          {mathPreviewEnabled && mathData && showMathPreview && (
            <MathPreviewWidget
              mathData={mathData}
              editorRef={editorRef}
              onClose={() => setShowMathPreview(false)}
            />
          )}
        </div>

        {showHistory && (
          <HistoryPanel
            historyItems={historyItems}
            onSelect={handleSelectHistoryItem}
            onClose={() => {
              setShowHistory(false);
              setHistoryMode(false);
            }}
          />
        )}
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

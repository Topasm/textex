import Editor, { BeforeMount, OnMount } from '@monaco-editor/react'
import { useEffect, useRef, useState, useCallback, lazy, Suspense } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { useProjectStore } from '../store/useProjectStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { stopLspClient } from '../lsp/lspClient'
import { useClickNavigation } from '../hooks/editor/useClickNavigation'
import { useSpelling } from '../hooks/editor/useSpelling'
import { useDocumentSymbols } from '../hooks/editor/useDocumentSymbols'
import { useCompletion } from '../hooks/editor/useCompletion'
import { useEditorDiagnostics } from '../hooks/editor/useEditorDiagnostics'
import { usePendingJump } from '../hooks/editor/usePendingJump'
import { usePendingInsert } from '../hooks/editor/usePendingInsert'
import { usePackageDetection } from '../hooks/editor/usePackageDetection'
import { useMathPreview } from '../hooks/editor/useMathPreview'
import { useSmartImageDrop } from '../hooks/editor/useSmartImageDrop'
import { useSectionHighlight } from '../hooks/editor/useSectionHighlight'
import { useEditorCommands } from '../hooks/editor/useEditorCommands'
import { useHistoryPanel } from '../hooks/editor/useHistoryPanel'
import { useTableEditor } from '../hooks/editor/useTableEditor'
import { MathPreviewWidget } from './MathPreviewWidget'
import { DiffEditor } from '@monaco-editor/react'
import type { editor as monacoEditor } from 'monaco-editor'
import { registerAiActions } from './editor/editorAiActions'
import { configureMonacoLanguages, getMonacoTheme } from '../data/monacoConfig'
import { generateFigureSnippet } from '../utils/figureSnippet'

// Lazy-load heavy modals that are rarely shown
const TableEditorModal = lazy(() =>
  import('./TableEditorModal').then((m) => ({ default: m.TableEditorModal }))
)
const HistoryPanel = lazy(() =>
  import('./HistoryPanel').then((m) => ({ default: m.HistoryPanel }))
)

type MonacoInstance = typeof import('monaco-editor')

function EditorPane() {
  const content = useEditorStore((s) => s.content)
  const setContent = useEditorStore((s) => s.setContent)
  const setCursorPosition = useEditorStore((s) => s.setCursorPosition)
  const projectRoot = useProjectStore((s) => s.projectRoot)
  const settings = useSettingsStore((s) => s.settings)
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
  usePendingInsert({ editorRef, monacoRef })
  usePackageDetection(content)
  const mathData = useMathPreview({ editorRef, enabled: mathPreviewEnabled })
  useSectionHighlight({ editorRef, monacoRef })
  const { handleDrop: handleSmartImageDrop } = useSmartImageDrop()
  const [showMathPreview, setShowMathPreview] = useState(true)
  const prevMathRangeRef = useRef<string | null>(null)

  // History panel hook
  const {
    showHistory,
    setShowHistory,
    historyItems,
    snapshotContent,
    historyMode,
    setHistoryMode,
    handleSelectHistoryItem,
    closeHistory
  } = useHistoryPanel()

  // Table editor hook
  const { tableModal, setTableModal, registerTableEditor, disposeTableEditor } = useTableEditor()

  // Editor commands hook
  const registerEditorCommands = useEditorCommands({ setShowHistory, showHistory, setHistoryMode })

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

  const handleEditorWillMount: BeforeMount = (monaco) => {
    configureMonacoLanguages(monaco)
  }

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    aiEnabledKeyRef.current = editor.createContextKey('textex.aiEnabled', aiEnabled)
    monacoRef.current = monaco
    cursorDisposableRef.current = editor.onDidChangeCursorPosition((e) => {
      setCursorPosition(e.position.lineNumber, e.position.column)
    })

    mouseDisposableRef.current = registerClickNavigation(editor)
    completionDisposablesRef.current.push(...registerCompletionProviders(editor, monaco))

    // Register editor commands (search, format, user info, history toggle, palette filter)
    registerEditorCommands(editor, monaco)

    // Register CodeLens + command for table editor
    registerTableEditor(editor, monaco)

    // Register AI Actions (extracted to editorAiActions.ts)
    registerAiActions(editor)
  }

  // Keep the aiEnabled context key in sync with settings
  useEffect(() => {
    if (aiEnabledKeyRef.current) {
      aiEnabledKeyRef.current.set(aiEnabled)
    }
  }, [aiEnabled])

  // Vim Mode
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !settings.vimMode) {
      if ((window as any).vimMode) {
        ;(window as any).vimMode.dispose()
        ;(window as any).vimMode = null
      }
      return
    }

    // Load monaco-vim dynamically to avoid issues if not needed
    import('monaco-vim').then(({ initVimMode }) => {
      const statusNode = document.getElementById('vim-status-bar')
      if (editor && settings.vimMode && !(window as any).vimMode) {
        ;(window as any).vimMode = initVimMode(editor, statusNode)
      }
    })

    return () => {
      if ((window as any).vimMode) {
        ;(window as any).vimMode.dispose()
        ;(window as any).vimMode = null
      }
    }
  }, [settings.vimMode])

  useEffect(() => {
    const completionDisposables = completionDisposablesRef
    return () => {
      cursorDisposableRef.current?.dispose()
      mouseDisposableRef.current?.dispose()
      for (const d of completionDisposables.current) d.dispose()
      disposeTableEditor()
      stopLspClient()
      if ((window as any).vimMode) {
        ;(window as any).vimMode.dispose()
        ;(window as any).vimMode = null
      }
    }
  }, [disposeTableEditor])

  const handleChange = useCallback(
    (value: string | undefined): void => {
      if (value !== undefined) {
        setContent(value)
      }
    },
    [setContent]
  )

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

          // Try smart image drop first (OS file manager drops)
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            await handleSmartImageDrop(e, editorRef.current, monacoRef.current)
            return
          }

          // Handle FileTree image drops (internal drag)
          const imagePath = e.dataTransfer.getData('application/x-textex-image-path')
          if (imagePath && projectRoot) {
            const editor = editorRef.current
            const monaco = monacoRef.current
            if (!editor || !monaco) return

            const sep = projectRoot.includes('\\') ? '\\' : '/'
            const relPath = imagePath.startsWith(projectRoot + sep)
              ? imagePath.slice(projectRoot.length + 1).replace(/\\/g, '/')
              : imagePath.split(/[\\/]/).pop() || imagePath
            const fileName = imagePath.split(/[\\/]/).pop() || 'image'
            const snippet = generateFigureSnippet(relPath, fileName)

            const target = editor.getTargetAtClientPoint(e.clientX, e.clientY)
            if (target?.position) {
              const pos = target.position
              editor.executeEdits('image-drop', [
                {
                  range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
                  text: snippet,
                  forceMoveMarkers: true
                }
              ])
              editor.setPosition(pos)
              editor.focus()
            }
            return
          }

          const text = e.dataTransfer.getData('text/plain')
          const editor = editorRef.current
          const monaco = monacoRef.current
          if (!text || !editor || !monaco) return

          const target = editor.getTargetAtClientPoint(e.clientX, e.clientY)
          if (target?.position) {
            const pos = target.position
            editor.executeEdits('bib-drop', [
              {
                range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
                text,
                forceMoveMarkers: true
              }
            ])
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
                dropIntoEditor: { enabled: false }
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
          <Suspense fallback={null}>
            <HistoryPanel
              historyItems={historyItems}
              onSelect={handleSelectHistoryItem}
              onClose={closeHistory}
            />
          </Suspense>
        )}
      </div>

      {tableModal.isOpen && (
        <Suspense fallback={null}>
          <TableEditorModal
            initialLatex={tableModal.latex}
            onClose={() => setTableModal((prev) => ({ ...prev, isOpen: false }))}
            onApply={(newLatex) => {
              if (editorRef.current && tableModal.range) {
                editorRef.current.executeEdits('table-editor', [
                  {
                    range: tableModal.range,
                    text: newLatex,
                    forceMoveMarkers: true
                  }
                ])
                setTableModal((prev) => ({ ...prev, isOpen: false }))
              }
            }}
          />
        </Suspense>
      )}
      <div id="vim-status-bar" style={{ fontSize: '12px', padding: '0 5px' }} />
    </>
  )
}

export default EditorPane

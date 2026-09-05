import { useLocalSearchRequest } from '../hooks/useLocalSearchRequest'
import Editor, { BeforeMount, OnMount } from '@monaco-editor/react'
import { useFeatureModal } from '../hooks/useFeatureModal'
import { memo, useEffect, useRef, useState, useCallback, useMemo, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../store/useEditorStore'
import { useAiContextStore } from '../store/useAiContextStore'
import { useProjectStore } from '../store/useProjectStore'
import { useSettingsStore, resolveTheme } from '../store/useSettingsStore'
import { useNotificationStore } from '../store/useNotificationStore'
import { useClickNavigation } from '../hooks/editor/useClickNavigation'
import { useSpelling } from '../hooks/editor/useSpelling'
import { useDocumentSymbols } from '../hooks/editor/useDocumentSymbols'
import { useCompletion } from '../hooks/editor/useCompletion'
import { useEditorDiagnostics } from '../hooks/editor/useEditorDiagnostics'
import { usePendingActions } from '../hooks/editor/usePendingActions'
import { usePreviewSourceHighlight } from '../hooks/editor/usePreviewSourceHighlight'
import { useContentChangeCoordinator } from '../hooks/editor/useContentChangeCoordinator'
import { usePackageDetection } from '../hooks/editor/usePackageDetection'
import { useMathPreview } from '../hooks/editor/useMathPreview'
import { useSmartImageDrop } from '../hooks/editor/useSmartImageDrop'
import { useClipboardImagePaste } from '../hooks/editor/useClipboardImagePaste'
import { useSectionHighlight } from '../hooks/editor/useSectionHighlight'
import { useEditorCommands } from '../hooks/editor/useEditorCommands'
import { useTableEditor } from '../hooks/editor/useTableEditor'
import type { editor as monacoEditor, Selection } from 'monaco-editor'
import {
  AI_ACTIONS,
  registerAiActions,
  runAiAction,
  runAiCustomCommand,
  type AiActionDef
} from './editor/editorAiActions'
import { SelectionAiToolbar } from './editor/SelectionAiToolbar'
import { getAiContextStatus, updateCurrentDocumentAiContext } from '../services/aiContext'
import { configureMonacoLanguages, getMonacoTheme } from '../data/monacoConfig'
import { generateFigureSnippet } from '../utils/figureSnippet'
import {
  addReferenceAndBuildCitation,
  parseReferenceDragData,
  TEXTEX_REFERENCE_MIME
} from './research/referenceActions'
import type { EditorAdapter } from '../editor/EditorAdapter'
import { MonacoEditorAdapter } from '../editor/MonacoEditorAdapter'
import { setActiveEditorAdapter } from '../editor/activeEditorAdapter'
import { runtimePerformance } from '../services/runtimePerformance'
import { documentRegistry } from '../models/documentRegistry'
import { isFeatureEnabled } from '../utils/featureFlags'
import { errorMessage, logError } from '../utils/errorMessage'
import { LoadingFallback } from './LoadingFallback'
import {
  clearResearchProfileDraft,
  confirmResearchProfileDraftDiscard
} from '../services/researchProfileDraft'

// Lazy-load heavy modals that are rarely shown
const TableEditorModal = lazy(() =>
  import('./TableEditorModal').then((m) => ({ default: m.TableEditorModal }))
)
const MathPreviewWidget = lazy(() =>
  import('./MathPreviewWidget').then((m) => ({ default: m.MathPreviewWidget }))
)

type MonacoInstance = typeof import('monaco-editor')

function EditorPane() {
  const { t } = useTranslation()
  const filePath = useEditorStore((s) => s.filePath)
  const setCursorPosition = useEditorStore((s) => s.setCursorPosition)
  const projectRoot = useProjectStore((s) => s.projectRoot)
  const settings = useSettingsStore((s) => s.settings)
  const pushNotification = useNotificationStore((s) => s.pushNotification)
  const cachedAiContext = useAiContextStore((s) => (filePath ? s.entries[filePath] : null))
  const theme = settings.theme
  const fontSize = settings.fontSize
  const spellCheckEnabled = isFeatureEnabled(settings, 'spellcheck')
  const mathPreviewEnabled = settings.mathPreviewEnabled !== false
  const aiEnabled = isFeatureEnabled(settings, 'ai')
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<MonacoInstance | null>(null)
  const editorAdapterRef = useRef<EditorAdapter | null>(null)
  const cursorDisposableRef = useRef<{ dispose(): void } | null>(null)
  const mouseDisposableRef = useRef<{ dispose(): void } | null>(null)
  const selectionDisposableRef = useRef<{ dispose(): void } | null>(null)
  const selectionMouseDownDisposableRef = useRef<{ dispose(): void } | null>(null)
  const selectionMouseUpDisposableRef = useRef<{ dispose(): void } | null>(null)
  const selectionScrollDisposableRef = useRef<{ dispose(): void } | null>(null)
  const selectionBlurDisposableRef = useRef<{ dispose(): void } | null>(null)
  const documentChangeDisposableRef = useRef<{ dispose(): void } | null>(null)
  const completionDisposablesRef = useRef<{ dispose(): void }[]>([])
  const aiEnabledKeyRef = useRef<{ set(value: boolean): void } | null>(null)
  const mouseSelectionStartedRef = useRef(false)
  const pendingMouseSelectionRef = useRef<Selection | null>(null)
  const registerClickNavigation = useClickNavigation()
  const { runSpellCheck } = useSpelling({
    enabled: spellCheckEnabled,
    editorRef,
    monacoRef
  })
  const registerCompletionProviders = useCompletion(runSpellCheck)
  const initialContent = useMemo(
    () => (filePath ? (documentRegistry.snapshot(filePath)?.text ?? '') : ''),
    [filePath]
  )
  const { refreshOutline } = useDocumentSymbols()
  const refreshEditorDiagnostics = useEditorDiagnostics(editorAdapterRef)
  const refreshSearch = useLocalSearchRequest('document', () => {
    if (!editorRef.current || editorAdapterRef.current?.getDocumentId() !== filePath) return false
    editorRef.current.trigger('search', 'actions.find', {})
    return true
  })
  const refreshPendingActions = usePendingActions(editorAdapterRef)
  const refreshPreviewSourceHighlight = usePreviewSourceHighlight(editorAdapterRef)
  const { detectPackages } = usePackageDetection()
  // Coordinated content-change analysis pipeline:
  // Replaces 3 independent debounce timers with a single scheduler
  const scheduleContentTasks = useContentChangeCoordinator(
    useMemo(
      () => [
        { key: 'spellcheck', fn: runSpellCheck, delayMs: 500 },
        { key: 'packages', fn: detectPackages, delayMs: 1500, idle: true },
        { key: 'symbols', fn: refreshOutline, delayMs: 2000, idle: true }
      ],
      [runSpellCheck, detectPackages, refreshOutline]
    )
  )
  const mathData = useMathPreview({ editorRef, enabled: mathPreviewEnabled })
  useSectionHighlight({ editorRef, monacoRef })
  const { handleDrop: handleSmartImageDrop } = useSmartImageDrop()
  const { handlePaste: handleClipboardImagePaste } = useClipboardImagePaste()
  const [showMathPreview, setShowMathPreview] = useState(true)
  const [selectionAiToolbarSelection, setSelectionAiToolbarSelection] = useState<Selection | null>(
    null
  )
  const [isUpdatingAiContext, setIsUpdatingAiContext] = useState(false)
  const [isNarrow, setIsNarrow] = useState(false)
  const editorContainerRef = useRef<HTMLDivElement | null>(null)
  const prevMathRangeRef = useRef<string | null>(null)
  // Force word-wrap when the editor pane is too narrow (e.g. terminal pane open),
  // even if the user setting is off, so long LaTeX lines don't get clipped.
  const NARROW_WIDTH_PX = 600
  const effectiveWordWrap = settings.wordWrap || isNarrow ? 'on' : 'off'

  const materializedUiContent =
    selectionAiToolbarSelection && filePath ? (documentRegistry.snapshot(filePath)?.text ?? '') : ''
  const aiContextStatus = selectionAiToolbarSelection
    ? getAiContextStatus(filePath, materializedUiContent)
    : 'missing'
  const scheduleContentTasksRef = useRef(scheduleContentTasks)
  scheduleContentTasksRef.current = scheduleContentTasks

  // Table editor hook
  const { tableModal, setTableModal, registerTableEditor, disposeTableEditor } = useTableEditor()
  // Covers the lazy chunk's loading fallback as well as the modal itself.
  useFeatureModal('tableEditor', tableModal.isOpen)

  // Editor commands hook
  const registerEditorCommands = useEditorCommands()

  const hideSelectionAiToolbar = useCallback(() => {
    pendingMouseSelectionRef.current = null
    setSelectionAiToolbarSelection(null)
  }, [])

  const handleSelectionAiAction = useCallback(
    async (action: AiActionDef) => {
      const editor = editorRef.current
      hideSelectionAiToolbar()
      if (!editor) return
      await runAiAction(editor, action)
    },
    [hideSelectionAiToolbar]
  )

  const handleSelectionAiCommand = useCallback(
    async (command: string) => {
      const editor = editorRef.current
      hideSelectionAiToolbar()
      if (!editor) return
      await runAiCustomCommand(editor, command)
    },
    [hideSelectionAiToolbar]
  )

  const handleSelectionContextUpdate = useCallback(async () => {
    setIsUpdatingAiContext(true)
    try {
      await updateCurrentDocumentAiContext()
    } catch (err) {
      console.error(err)
      alert('AI context update failed. Check your AI settings and try again.')
    } finally {
      setIsUpdatingAiContext(false)
    }
  }, [])

  const selectedResearchText = useCallback(() => {
    const editor = editorRef.current
    const selection = editor?.getSelection()
    const model = editor?.getModel()
    if (!editor || !selection || !model || selection.isEmpty()) return null
    const content = model.getValueInRange(selection).trim()
    if (!content) return null
    return { selection, content }
  }, [])

  const canOpenResearchTool = useCallback(() => {
    const store = useProjectStore.getState()
    if (!store.isResearchPanelOpen || store.researchPanelTab !== 'profile') return true
    if (!confirmResearchProfileDraftDiscard()) return false
    clearResearchProfileDraft()
    return true
  }, [])

  const handleSelectionAskChat = useCallback(() => {
    const selected = selectedResearchText()
    if (!selected || !projectRoot || !filePath || !canOpenResearchTool()) return
    useProjectStore.getState().queueResearchSelection({
      projectRoot,
      filePath,
      content: selected.content.slice(0, 12_000),
      startLine: selected.selection.startLineNumber,
      endLine: selected.selection.endLineNumber
    })
    useProjectStore.getState().openResearchPanel('chat')
    hideSelectionAiToolbar()
  }, [canOpenResearchTool, filePath, hideSelectionAiToolbar, projectRoot, selectedResearchText])

  const handleSelectionFindSources = useCallback(() => {
    const selected = selectedResearchText()
    if (!selected || !projectRoot || !canOpenResearchTool()) return
    const query = selected.content.replace(/\s+/gu, ' ').trim().slice(0, 512)
    const store = useProjectStore.getState()
    store.setResearchSearchQuery(query)
    store.openReferences('project')
    hideSelectionAiToolbar()
  }, [canOpenResearchTool, hideSelectionAiToolbar, projectRoot, selectedResearchText])

  // Track editor container width so we can auto-enable word wrap when it gets narrow
  // (e.g., when the terminal pane is open and shrinks the editor).
  useEffect(() => {
    const node = editorContainerRef.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? node.clientWidth
      setIsNarrow(width > 0 && width < NARROW_WIDTH_PX)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

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
    editorAdapterRef.current?.dispose()
    const editorAdapter = new MonacoEditorAdapter(editor, monaco, filePath)
    editorAdapterRef.current = editorAdapter
    setActiveEditorAdapter(editorAdapter)
    const buffer = editorAdapter.getDocumentBuffer()
    if (filePath && buffer) documentRegistry.bindBuffer(filePath, buffer)
    documentChangeDisposableRef.current?.dispose()
    documentChangeDisposableRef.current = editorAdapter.onDidChangeDocument((event) => {
      if (!event.documentId) return
      useEditorStore.getState().recordEditorChange(event.documentId)
      runtimePerformance.recordDocumentChange()
      scheduleContentTasksRef.current()
    })
    runtimePerformance.recordEditorInteractive()
    aiEnabledKeyRef.current = editor.createContextKey('textex.aiEnabled', aiEnabled)
    monacoRef.current = monaco
    refreshEditorDiagnostics()
    refreshPreviewSourceHighlight()
    refreshPendingActions()
    refreshSearch()
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

    selectionDisposableRef.current = editor.onDidChangeCursorSelection((e) => {
      if (!aiEnabled) {
        hideSelectionAiToolbar()
        return
      }

      if (e.selection.isEmpty()) {
        hideSelectionAiToolbar()
        return
      }

      if (e.source === 'mouse' && mouseSelectionStartedRef.current) {
        pendingMouseSelectionRef.current = e.selection
        return
      }

      if (e.source !== 'mouse') {
        hideSelectionAiToolbar()
      }
    })

    selectionMouseDownDisposableRef.current = editor.onMouseDown((e) => {
      const isContentTarget =
        e.target.type === monaco.editor.MouseTargetType.CONTENT_TEXT ||
        e.target.type === monaco.editor.MouseTargetType.CONTENT_EMPTY
      if (!isContentTarget) return
      mouseSelectionStartedRef.current = true
      hideSelectionAiToolbar()
    })

    selectionMouseUpDisposableRef.current = editor.onMouseUp(() => {
      if (!mouseSelectionStartedRef.current) return
      mouseSelectionStartedRef.current = false

      const selection = editor.getSelection()
      if (!aiEnabled || !selection || selection.isEmpty() || !pendingMouseSelectionRef.current) {
        hideSelectionAiToolbar()
        return
      }

      setSelectionAiToolbarSelection(selection)
      pendingMouseSelectionRef.current = null
    })

    selectionScrollDisposableRef.current = editor.onDidScrollChange(() => {
      hideSelectionAiToolbar()
    })

    selectionBlurDisposableRef.current = editor.onDidBlurEditorText(() => {
      window.setTimeout(() => {
        const activeElement = document.activeElement
        if (
          activeElement instanceof HTMLElement &&
          activeElement.closest('[data-testid="selection-ai-toolbar"]')
        ) {
          return
        }
        hideSelectionAiToolbar()
      }, 0)
    })
  }

  useEffect(() => {
    const editorAdapter = editorAdapterRef.current
    if (!editorAdapter) return
    editorAdapter.setDocumentId(filePath)
    const buffer = editorAdapter.getDocumentBuffer()
    if (filePath && buffer) documentRegistry.bindBuffer(filePath, buffer)
    refreshPreviewSourceHighlight()
    refreshPendingActions()
    refreshSearch()
  }, [filePath, refreshPreviewSourceHighlight, refreshPendingActions, refreshSearch])

  // Keep the aiEnabled context key in sync with settings
  useEffect(() => {
    if (aiEnabledKeyRef.current) {
      aiEnabledKeyRef.current.set(aiEnabled)
    }
  }, [aiEnabled])

  useEffect(() => {
    if (!aiEnabled) {
      hideSelectionAiToolbar()
    }
  }, [aiEnabled, hideSelectionAiToolbar])

  // Vim Mode
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !settings.vimMode) {
      if (window.vimMode) {
        window.vimMode.dispose()
        window.vimMode = null
      }
      return
    }

    // Load monaco-vim dynamically to avoid issues if not needed
    import('monaco-vim').then(({ initVimMode }) => {
      const statusNode = document.getElementById('vim-status-bar')
      if (editor && settings.vimMode && !window.vimMode) {
        window.vimMode = initVimMode(editor, statusNode)
      }
    })

    return () => {
      if (window.vimMode) {
        window.vimMode.dispose()
        window.vimMode = null
      }
    }
  }, [settings.vimMode])

  useEffect(() => {
    const completionDisposables = completionDisposablesRef
    return () => {
      cursorDisposableRef.current?.dispose()
      mouseDisposableRef.current?.dispose()
      selectionDisposableRef.current?.dispose()
      selectionMouseDownDisposableRef.current?.dispose()
      selectionMouseUpDisposableRef.current?.dispose()
      selectionScrollDisposableRef.current?.dispose()
      selectionBlurDisposableRef.current?.dispose()
      documentChangeDisposableRef.current?.dispose()
      for (const d of completionDisposables.current) d.dispose()
      disposeTableEditor()
      setActiveEditorAdapter(null)
      editorAdapterRef.current?.dispose()
      editorAdapterRef.current = null
      if (window.vimMode) {
        window.vimMode.dispose()
        window.vimMode = null
      }
    }
  }, [disposeTableEditor])

  return (
    <>
      <div
        style={{ height: '100%', display: 'flex' }}
        onBeforeInputCapture={() => runtimePerformance.beginInput()}
        onPasteCapture={(e) => {
          // Capture phase: an image paste must be claimed before Monaco's own
          // textarea listener turns the clipboard into text.
          void handleClipboardImagePaste(e, editorAdapterRef.current)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }}
        onDrop={async (e) => {
          e.preventDefault()

          // Try smart image drop first (OS file manager drops)
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            await handleSmartImageDrop(e, editorAdapterRef.current)
            return
          }

          // Handle FileTree image drops (internal drag)
          const imagePath = e.dataTransfer.getData('application/x-textex-image-path')
          if (imagePath && projectRoot) {
            const editorAdapter = editorAdapterRef.current
            if (!editorAdapter) return

            const sep = projectRoot.includes('\\') ? '\\' : '/'
            const relPath = imagePath.startsWith(projectRoot + sep)
              ? imagePath.slice(projectRoot.length + 1).replace(/\\/g, '/')
              : imagePath.split(/[\\/]/).pop() || imagePath
            const fileName = imagePath.split(/[\\/]/).pop() || 'image'
            const snippet = generateFigureSnippet(relPath, fileName)

            const targetPosition = editorAdapter.getPositionAtClientPoint(e.clientX, e.clientY)
            if (targetPosition) {
              editorAdapter.applyEdits('image-drop', [
                {
                  range: { start: targetPosition, end: targetPosition },
                  text: snippet,
                  forceMoveMarkers: true
                }
              ])
              editorAdapter.setPosition(targetPosition)
              editorAdapter.focus()
            }
            return
          }

          const editorAdapter = editorAdapterRef.current
          if (!editorAdapter) return

          const referenceData = e.dataTransfer.getData(TEXTEX_REFERENCE_MIME)
          if (referenceData) {
            const payload = parseReferenceDragData(referenceData)
            const targetPosition = editorAdapter.getPositionAtClientPoint(e.clientX, e.clientY)
            if (!payload) {
              pushNotification({
                id: 'reference-drop:invalid-payload',
                message: t('notifications.referenceDropInvalid'),
                tone: 'error'
              })
              return
            }
            if (!targetPosition) {
              pushNotification({
                id: 'reference-drop:invalid-position',
                message: t('notifications.referenceDropPositionUnavailable'),
                tone: 'warning'
              })
              return
            }
            const targetSnapshot = editorAdapter.materializeSnapshot()
            try {
              const citation = await addReferenceAndBuildCitation(payload)
              const currentSnapshot = editorAdapter.materializeSnapshot()
              if (
                editorAdapterRef.current !== editorAdapter ||
                currentSnapshot.documentId !== targetSnapshot.documentId ||
                currentSnapshot.engineRevision !== targetSnapshot.engineRevision
              ) {
                pushNotification({
                  id: 'reference-drop:document-changed',
                  message: t('notifications.referenceDropDocumentChanged'),
                  tone: 'warning'
                })
                return
              }
              editorAdapter.applyEdits('reference-drop', [
                {
                  range: { start: targetPosition, end: targetPosition },
                  text: citation,
                  forceMoveMarkers: true
                }
              ])
              editorAdapter.setPosition(targetPosition)
              editorAdapter.focus()
            } catch (error) {
              logError('ReferenceDrop:addReference', error)
              pushNotification({
                id: 'reference-drop:add-failed',
                message: t('notifications.referenceDropFailed', { reason: errorMessage(error) }),
                tone: 'error'
              })
            }
            return
          }

          const text = e.dataTransfer.getData('text/plain')
          if (!text) return

          const targetPosition = editorAdapter.getPositionAtClientPoint(e.clientX, e.clientY)
          if (targetPosition) {
            editorAdapter.applyEdits('bib-drop', [
              {
                range: { start: targetPosition, end: targetPosition },
                text,
                forceMoveMarkers: true
              }
            ])
            editorAdapter.setPosition(targetPosition)
            editorAdapter.focus()
          }
        }}
      >
        <div ref={editorContainerRef} style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <Editor
            height="100%"
            loading={<LoadingFallback variant="pane" label={t('loading.preparingEditor')} />}
            defaultLanguage="latex"
            theme={getMonacoTheme(resolveTheme(theme))}
            path={filePath ?? undefined}
            defaultValue={initialContent}
            keepCurrentModel
            beforeMount={handleEditorWillMount}
            onMount={handleEditorDidMount}
            options={{
              fontSize,
              lineNumbers: settings.lineNumbers !== false ? 'on' : 'off',
              minimap: { enabled: settings.minimapEnabled ?? false },
              tabSize: settings.tabSize ?? 4,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              quickSuggestions: true,
              suggestOnTriggerCharacters: true,
              padding: { top: 8 },
              wordWrap: effectiveWordWrap,
              dropIntoEditor: { enabled: false },
              bracketPairColorization: {
                enabled: settings.bracketPairColorization !== false
              },
              guides: {
                bracketPairs: settings.bracketPairColorization !== false,
                indentation: true
              },
              stickyScroll: {
                enabled: settings.stickyScrollEnabled !== false
              },
              smoothScrolling: settings.smoothScrolling !== false,
              cursorSmoothCaretAnimation: settings.smoothScrolling !== false ? 'on' : 'off',
              cursorBlinking: settings.smoothScrolling !== false ? 'smooth' : 'blink',
              fontLigatures: settings.fontLigatures ?? false,
              renderWhitespace: 'selection',
              foldingHighlight: true
            }}
          />
          {mathPreviewEnabled && mathData && showMathPreview && (
            <Suspense
              fallback={<LoadingFallback variant="floating" label={t('loading.mathPreview')} />}
            >
              <MathPreviewWidget
                mathData={mathData}
                editorRef={editorRef}
                onClose={() => setShowMathPreview(false)}
              />
            </Suspense>
          )}
          {selectionAiToolbarSelection && (
            <SelectionAiToolbar
              editorRef={editorRef}
              selection={selectionAiToolbarSelection}
              actions={AI_ACTIONS}
              onAction={handleSelectionAiAction}
              onCommand={handleSelectionAiCommand}
              onUpdateContext={handleSelectionContextUpdate}
              onAskChat={handleSelectionAskChat}
              onFindSources={handleSelectionFindSources}
              researchActionsDisabled={!projectRoot}
              contextStatus={cachedAiContext ? aiContextStatus : 'missing'}
              isUpdatingContext={isUpdatingAiContext}
              onClose={hideSelectionAiToolbar}
            />
          )}
        </div>
      </div>

      {tableModal.isOpen && (
        <Suspense fallback={<LoadingFallback variant="modal" label={t('loading.tableEditor')} />}>
          <TableEditorModal
            initialLatex={tableModal.latex}
            onClose={() => setTableModal((prev) => ({ ...prev, isOpen: false }))}
            onApply={(newLatex) => {
              const editorAdapter = editorAdapterRef.current
              if (editorAdapter && tableModal.range) {
                editorAdapter.applyEdits('table-editor', [
                  {
                    range: {
                      start: {
                        line: tableModal.range.startLineNumber,
                        column: tableModal.range.startColumn
                      },
                      end: {
                        line: tableModal.range.endLineNumber,
                        column: tableModal.range.endColumn
                      }
                    },
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

export default memo(EditorPane)

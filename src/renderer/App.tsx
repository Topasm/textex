import { useCallback, useEffect, useState, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderTree, BookOpen, ListTree, StickyNote, Clock, GitBranch } from 'lucide-react'
import Toolbar from './components/Toolbar'
import LogPanel from './components/LogPanel'
import StatusBar from './components/StatusBar'
import FileTree from './components/FileTree'
import TabBar from './components/TabBar'
import BibPanel from './components/BibPanel'
import OutlinePanel from './components/OutlinePanel'
import GitPanel from './components/GitPanel'
import { TodoPanel } from './components/TodoPanel'
import { TimelinePanel } from './components/TimelinePanel'
import UpdateNotification from './components/UpdateNotification'
import PreviewErrorBoundary from './components/PreviewErrorBoundary'
import HomeScreen from './components/HomeScreen'
import { useAutoCompile } from './hooks/useAutoCompile'
import { useFileOps } from './hooks/useFileOps'
import { useSessionRestore } from './hooks/useSessionRestore'
import { useIpcListeners } from './hooks/useIpcListeners'
import { useExternalFileReload } from './hooks/useExternalFileReload'
import ExternalChangeBanner from './components/ExternalChangeBanner'
import { useGitAutoRefresh } from './hooks/useGitAutoRefresh'
import { useBibAutoLoad } from './hooks/useBibAutoLoad'
import { useLspLifecycle } from './hooks/useLspLifecycle'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useDragResize } from './hooks/useDragResize'
import { executeAppCommand, toggleLogPanel } from './services/appCommands'
import { useEditorStore } from './store/useEditorStore'
import { useCompileStore } from './store/useCompileStore'
import { useProjectStore } from './store/useProjectStore'
import type { SidebarView } from './store/useProjectStore'
import { usePdfStore } from './store/usePdfStore'
import { useUiStore } from './store/useUiStore'
import { useSettingsStore } from './store/useSettingsStore'
import { openProject } from './utils/openProject'
import { errorMessage, logError } from './utils/errorMessage'
import { isFeatureEnabled } from './utils/featureFlags'
import { stopLspClient } from './lsp/lspClient'
import type { AppCommandId } from '../shared/types'
import { runtimePerformance } from './services/runtimePerformance'
import { documentRegistry } from './models/documentRegistry'
import { getDesktopCapabilities } from './platform/capabilities'
import {
  beginCompileTicket,
  canPublishCompileResponse,
  canPublishCompileTicket,
  isLatestCompileTicket,
  toCompileRequest
} from './services/compileCoordinator'

// Lazy-load heavy modals and panels that are rarely shown
const SettingsModal = lazy(() =>
  import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal }))
)
const DraftModal = lazy(() =>
  import('./components/DraftModal').then((m) => ({ default: m.DraftModal }))
)
const AiAssistantModal = lazy(() =>
  import('./components/AiAssistantModal').then((m) => ({ default: m.AiAssistantModal }))
)
const TemplateGallery = lazy(() => import('./components/TemplateGallery'))
const TerminalPane = lazy(() =>
  import('./components/TerminalPane').then((m) => ({ default: m.TerminalPane }))
)
const EditorPane = lazy(async () => {
  await import('./data/monacoSetup')
  return import('./components/EditorPane')
})
const PreviewPane = lazy(() => import('./components/PreviewPane'))

function App() {
  const { t } = useTranslation()
  const capabilities = getDesktopCapabilities()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  useAutoCompile()
  const { handleOpen, handleSave, handleSaveAs } = useFileOps()

  useEffect(() => {
    runtimePerformance.recordShellInteractive()
  }, [])

  // Only subscribe to state needed for rendering
  const splitRatio = usePdfStore((s) => s.splitRatio)
  const terminalRatio = usePdfStore((s) => s.terminalRatio)
  const isSidebarOpen = useProjectStore((s) => s.isSidebarOpen)
  const sidebarView = useProjectStore((s) => s.sidebarView)
  const sidebarWidth = useProjectStore((s) => s.sidebarWidth)
  const filePath = useEditorStore((s) => s.filePath)
  const projectRoot = useProjectStore((s) => s.projectRoot)
  const isGitRepo = useProjectStore((s) => s.isGitRepo)
  const settings = useSettingsStore((s) => s.settings)
  const lspEnabled = isFeatureEnabled(settings, 'lsp')
  const gitEnabled = isFeatureEnabled(settings, 'git')
  const autoHideSidebar = useSettingsStore((s) => s.settings.autoHideSidebar)
  const showStatusBar = useSettingsStore((s) => s.settings.showStatusBar)
  const sidebarPosition = settings.sidebarPosition ?? 'left'
  const isTerminalPaneOpen = useUiStore((s) => s.isTerminalPaneOpen)
  const terminalPaneOpen = capabilities.pty && isTerminalPaneOpen
  const isTemplateGalleryOpen = useUiStore((s) => s.isTemplateGalleryOpen)
  const toggleTerminalPane = useUiStore((s) => s.toggleTerminalPane)

  const [isDraftModalOpen, setIsDraftModalOpen] = useState(false)
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false)
  const [draftPrefill, setDraftPrefill] = useState<string | undefined>(undefined)

  const handleAiDraft = useCallback(
    (prefill?: string) => {
      if (!capabilities.ai) return
      setDraftPrefill(typeof prefill === 'string' ? prefill : undefined)
      setIsDraftModalOpen(true)
    },
    [capabilities.ai]
  )

  const handleToggleTerminalPane = useCallback(() => {
    if (capabilities.pty) toggleTerminalPane()
  }, [capabilities.pty, toggleTerminalPane])

  const handleDraftInsert = useCallback((latex: string) => {
    useEditorStore.getState().requestInsertAtCursor(latex)
  }, [])

  // ---- Compile handler ----
  const handleCompile = useCallback(async (): Promise<void> => {
    const editorState = useEditorStore.getState()
    if (!editorState.filePath) return
    if (!editorState.filePath.toLowerCase().endsWith('.tex')) return
    const snapshot = documentRegistry.snapshot(editorState.filePath)
    if (!snapshot) return
    try {
      await window.api.saveFile(snapshot.text, editorState.filePath)
      useEditorStore.getState().markDocumentSaved(editorState.filePath, snapshot.revision)
    } catch (err) {
      logError('App:preSave', err)
    }
    if (!documentRegistry.getModel(editorState.filePath)?.isCurrent(snapshot)) return
    const ticket = beginCompileTicket(editorState.filePath, snapshot)
    useCompileStore.getState().setCompileStatus('compiling')
    useCompileStore.getState().clearLogs()
    try {
      const result = await window.api.compile(toCompileRequest(ticket, 'high'))
      if (!canPublishCompileResponse(ticket, result)) {
        if (isLatestCompileTicket(ticket)) useCompileStore.getState().setCompileStatus('idle')
        return
      }
      useCompileStore.getState().setPdfPath(result.pdfPath, {
        documentId: snapshot.documentId,
        revision: snapshot.revision
      })
      useCompileStore.getState().setCompileStatus('success')
      const root = useProjectStore.getState().projectRoot
      if (root) {
        window.api
          .scanLabels(root)
          .then((labels) => {
            if (canPublishCompileTicket(ticket)) {
              useProjectStore.getState().setLabels(labels)
            }
          })
          .catch((err) => {
            logError('App:scanLabels', err)
          })
      }
    } catch (err: unknown) {
      if (!isLatestCompileTicket(ticket)) return
      if (!documentRegistry.getModel(ticket.filePath)?.isCurrent(ticket.snapshot)) {
        useCompileStore.getState().setCompileStatus('idle')
        return
      }
      useCompileStore.getState().appendLog(errorMessage(err))
      useCompileStore.getState().setCompileStatus('error')
    }
  }, [])

  // ---- Open folder handler ----
  const handleOpenFolder = useCallback(async (): Promise<void> => {
    const dirPath = await window.api.openDirectory()
    if (!dirPath) return
    await openProject(dirPath)
  }, [])

  // ---- Close project ----
  const handleCloseProject = useCallback(async (): Promise<void> => {
    try {
      await window.api.unwatchDirectory()
    } catch (err) {
      logError('App:unwatchDirectory', err)
    }
    stopLspClient()
    // Reset all stores on project close
    useEditorStore.getState().resetEditor()
    useCompileStore.setState({
      compileStatus: 'idle',
      pdfPath: null,
      pdfRevision: 0,
      pdfDocumentId: null,
      pdfDocumentRevision: null,
      logs: '',
      isLogPanelOpen: false,
      diagnostics: []
    })
    useProjectStore.setState({
      projectRoot: null,
      directoryTree: null,
      directoryRefreshVersions: {},
      projectIndex: null,
      isGitRepo: false,
      gitBranch: '',
      gitStatus: null,
      bibEntries: [],
      citationGroups: [],
      auxCitationMap: null,
      labels: [],
      packageData: {},
      detectedPackages: []
    })
    usePdfStore.setState({
      pdfSearchVisible: false,
      pdfSearchQuery: '',
      synctexHighlight: null
    })
    useUiStore.setState({
      lspStatus: 'stopped',
      lspError: null,
      documentSymbols: [],
      isTerminalPaneOpen: false,
      externalChangeConflicts: []
    })
  }, [])

  const handleExport = useCallback(
    async (format: string): Promise<void> => {
      if (!capabilities.documentExport) return
      const fp = useEditorStore.getState().filePath
      if (!fp) return
      useUiStore.getState().setExportStatus('exporting')
      try {
        const result = await window.api.exportDocument(fp, format)
        useUiStore.getState().setExportStatus(result?.success ? 'success' : 'error')
      } catch (err: unknown) {
        useCompileStore.getState().appendLog(`Export failed: ${errorMessage(err)}`)
        useUiStore.getState().setExportStatus('error')
      }
    },
    [capabilities.documentExport]
  )

  const handleOpenTemplateGallery = useCallback(() => {
    if (!capabilities.templates) return
    useUiStore.getState().setTemplateGalleryOpen(true)
  }, [capabilities.templates])

  const handleNewBlankProject = useCallback(async () => {
    if (!capabilities.templates) return
    const blankContent = `\\documentclass[12pt,a4paper]{article}

\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage[margin=1in]{geometry}

\\title{}
\\author{}
\\date{\\today}

\\begin{document}

\\maketitle



\\end{document}
`
    try {
      const result = await window.api.createTemplateProject('blank-project', blankContent)
      if (result) {
        await openProject(result.projectPath)
      }
    } catch {
      // user cancelled
    }
  }, [capabilities.templates])

  const handleCheckForUpdates = useCallback(async (): Promise<void> => {
    const result = await window.api.updateCheck()
    if (!result.success) {
      useUiStore.getState().setUpdateStatus('error')
    }
  }, [])

  const runAppCommand = useCallback(
    (command: AppCommandId): void => {
      void executeAppCommand(command, {
        checkForUpdates: handleCheckForUpdates,
        compile: handleCompile,
        openFile: handleOpen,
        openFolder: handleOpenFolder,
        openSettings: () => setIsSettingsOpen(true),
        openTemplateGallery: handleOpenTemplateGallery,
        runAiDraft: () => handleAiDraft(),
        save: handleSave,
        saveAs: handleSaveAs,
        toggleLog: toggleLogPanel,
        toggleTerminal: handleToggleTerminalPane,
        exportDocument: handleExport
      })
    },
    [
      handleAiDraft,
      handleCheckForUpdates,
      handleCompile,
      handleExport,
      handleOpen,
      handleOpenFolder,
      handleOpenTemplateGallery,
      handleSave,
      handleSaveAs,
      handleToggleTerminalPane
    ]
  )

  // ---- Sidebar tab definitions ----
  const iconSize = 14
  const allSidebarTabs: { key: SidebarView; label: string; icon: React.ReactNode }[] = [
    { key: 'files', label: t('sidebar.files'), icon: <FolderTree size={iconSize} /> },
    { key: 'bib', label: t('sidebar.bib'), icon: <BookOpen size={iconSize} /> },
    { key: 'outline', label: t('sidebar.outline'), icon: <ListTree size={iconSize} /> },
    { key: 'todo', label: t('sidebar.notes'), icon: <StickyNote size={iconSize} /> },
    { key: 'timeline', label: t('sidebar.timeline'), icon: <Clock size={iconSize} /> },
    { key: 'git', label: t('sidebar.git'), icon: <GitBranch size={iconSize} /> }
  ]
  const sidebarTabs = gitEnabled ? allSidebarTabs : allSidebarTabs.filter((t) => t.key !== 'git')

  // ---- Extracted hooks (formerly inline useEffect blocks) ----
  const sessionRestored = useSessionRestore()
  const handleExternalFileChange = useExternalFileReload(projectRoot)
  useIpcListeners(projectRoot, handleExternalFileChange)
  useGitAutoRefresh(projectRoot, isGitRepo, gitEnabled)
  useBibAutoLoad(projectRoot)
  useLspLifecycle(projectRoot, lspEnabled, filePath)
  useKeyboardShortcuts({ runCommand: runAppCommand })

  useEffect(() => {
    window.api.onAppCommand(runAppCommand)
    return () => {
      window.api.removeAppCommandListener()
    }
  }, [runAppCommand])
  const {
    mainContentRef,
    sidebarRef,
    handleDividerMouseDown,
    handleDividerDoubleClick,
    handleTerminalDividerMouseDown,
    handleTerminalDividerDoubleClick,
    handleSidebarDividerMouseDown,
    handleSidebarDividerDoubleClick,
    handleSidebarWheel,
    slideAnim
  } = useDragResize({
    sidebarPosition,
    sidebarTabs: sidebarTabs.map((tab) => tab.key),
    terminalPaneOpen,
    terminalRatio
  })

  const showHomeScreen = !projectRoot
  const sidebarHandleStyle = autoHideSidebar
    ? sidebarPosition === 'right'
      ? { right: `${sidebarWidth}px`, left: 'auto' }
      : { left: `${sidebarWidth}px`, right: 'auto' }
    : undefined
  const sidebarWrapperClass = `sidebar-wrapper sidebar-${sidebarPosition}${autoHideSidebar ? ' sidebar-auto-hide' : ''}`
  const sidebarElement = (
    <div className={sidebarWrapperClass}>
      {sidebarPosition === 'right' && (
        <div
          className={`sidebar-resize-handle sidebar-${sidebarPosition}`}
          style={sidebarHandleStyle}
          onMouseDown={handleSidebarDividerMouseDown}
          onDoubleClick={handleSidebarDividerDoubleClick}
        />
      )}
      <div
        className={`sidebar sidebar-${sidebarPosition}`}
        ref={sidebarRef}
        style={{ width: `${sidebarWidth}px` }}
        onWheel={handleSidebarWheel}
      >
        <div className="sidebar-tabs">
          {sidebarTabs.map((tab) => (
            <button
              key={tab.key}
              className={`sidebar-tab${sidebarView === tab.key ? ' active' : ''}`}
              onClick={() => useProjectStore.getState().setSidebarView(tab.key)}
              title={tab.label}
            >
              {tab.icon}
              <span className="sidebar-tab-label">{tab.label}</span>
            </button>
          ))}
          <button
            className="sidebar-pin-btn"
            title={autoHideSidebar ? t('sidebar.pinSidebar') : t('sidebar.unpinSidebar')}
            onClick={() => {
              if (autoHideSidebar) {
                useSettingsStore.getState().updateSetting('autoHideSidebar', false)
                if (!useProjectStore.getState().isSidebarOpen) {
                  useProjectStore.getState().toggleSidebar()
                }
              } else {
                useSettingsStore.getState().updateSetting('autoHideSidebar', true)
              }
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              {autoHideSidebar ? (
                <path
                  d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a6 6 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182a.5.5 0 0 1-.707-.708l3.182-3.181L2.4 7.328a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a6 6 0 0 1 1.013.16l3.134-3.133a3 3 0 0 1-.04-.461c0-.43.109-1.022.589-1.503a.5.5 0 0 1 .353-.146z"
                  transform="rotate(45, 8, 8)"
                />
              ) : (
                <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a6 6 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182a.5.5 0 0 1-.707-.708l3.182-3.181L2.4 7.328a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a6 6 0 0 1 1.013.16l3.134-3.133a3 3 0 0 1-.04-.461c0-.43.109-1.022.589-1.503a.5.5 0 0 1 .353-.146z" />
              )}
            </svg>
          </button>
        </div>
        <div className={`sidebar-content${slideAnim ? ` sidebar-${slideAnim}` : ''}`}>
          {sidebarView === 'files' && <FileTree />}
          {sidebarView === 'git' && <GitPanel />}
          {sidebarView === 'bib' && <BibPanel />}
          {sidebarView === 'outline' && <OutlinePanel />}
          {sidebarView === 'todo' && <TodoPanel />}
          {sidebarView === 'timeline' && <TimelinePanel />}
        </div>
      </div>
      {sidebarPosition === 'left' && (
        <div
          className={`sidebar-resize-handle sidebar-${sidebarPosition}`}
          style={sidebarHandleStyle}
          onMouseDown={handleSidebarDividerMouseDown}
          onDoubleClick={handleSidebarDividerDoubleClick}
        />
      )}
    </div>
  )

  return (
    <div className="app-container">
      <Toolbar
        onSave={handleSave}
        onCompile={handleCompile}
        onToggleLog={toggleLogPanel}
        onOpenFolder={handleOpenFolder}
        onReturnHome={handleCloseProject}
        onNewFromTemplate={handleOpenTemplateGallery}
        onAiDraft={handleAiDraft}
        onAiAssistant={() => {
          if (capabilities.ai) setIsAiAssistantOpen(true)
        }}
        onToggleTerminalPane={handleToggleTerminalPane}
        isTerminalPaneOpen={terminalPaneOpen}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      {isSettingsOpen && (
        <Suspense fallback={null}>
          <SettingsModal onClose={() => setIsSettingsOpen(false)} />
        </Suspense>
      )}
      {capabilities.ai && isAiAssistantOpen && (
        <Suspense fallback={null}>
          <AiAssistantModal
            isOpen
            onClose={() => setIsAiAssistantOpen(false)}
            onAiDraft={() => handleAiDraft()}
          />
        </Suspense>
      )}
      {capabilities.ai && isDraftModalOpen && (
        <Suspense fallback={null}>
          <DraftModal
            isOpen
            onClose={() => {
              setIsDraftModalOpen(false)
              setDraftPrefill(undefined)
            }}
            onInsert={handleDraftInsert}
            initialPrompt={draftPrefill}
          />
        </Suspense>
      )}
      <UpdateNotification />
      <ExternalChangeBanner />
      {!sessionRestored ? null : showHomeScreen ? (
        <HomeScreen
          onOpenFolder={handleOpenFolder}
          onNewBlankProject={handleNewBlankProject}
          onNewFromTemplate={handleOpenTemplateGallery}
        />
      ) : (
        <div className="workspace">
          {sidebarPosition === 'left' && (isSidebarOpen || autoHideSidebar) && sidebarElement}
          <div className="editor-area">
            <div className="editor-main-content" ref={mainContentRef}>
              <div
                className="editor-pane"
                style={{
                  width: `${splitRatio * (terminalPaneOpen ? 1 - terminalRatio : 1) * 100}%`
                }}
              >
                <TabBar />
                <Suspense fallback={null}>
                  <EditorPane />
                </Suspense>
              </div>
              <div
                className="split-divider"
                onMouseDown={handleDividerMouseDown}
                onDoubleClick={handleDividerDoubleClick}
              />
              <div
                className="preview-pane"
                style={{
                  width: `${(1 - splitRatio) * (terminalPaneOpen ? 1 - terminalRatio : 1) * 100}%`
                }}
              >
                <PreviewErrorBoundary>
                  <Suspense fallback={null}>
                    <PreviewPane />
                  </Suspense>
                </PreviewErrorBoundary>
              </div>
              {terminalPaneOpen && (
                <>
                  <div
                    className="split-divider terminal-split-divider"
                    onMouseDown={handleTerminalDividerMouseDown}
                    onDoubleClick={handleTerminalDividerDoubleClick}
                  />
                  <div className="terminal-pane" style={{ width: `${terminalRatio * 100}%` }}>
                    <Suspense fallback={null}>
                      <TerminalPane />
                    </Suspense>
                  </div>
                </>
              )}
            </div>
          </div>
          {sidebarPosition === 'right' && (isSidebarOpen || autoHideSidebar) && sidebarElement}
        </div>
      )}
      <LogPanel />
      {showStatusBar && <StatusBar />}
      {capabilities.templates && isTemplateGalleryOpen && (
        <Suspense fallback={null}>
          <TemplateGallery />
        </Suspense>
      )}
    </div>
  )
}

export default App

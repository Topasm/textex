import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  lazy,
  Suspense,
  type CSSProperties
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  FolderTree,
  ListTree,
  StickyNote,
  Clock,
  GitBranch,
  PanelRightOpen,
  Pin,
  PinOff
} from 'lucide-react'
import Toolbar from './components/Toolbar'
import StatusBar from './components/StatusBar'
import TabBar from './components/TabBar'
import PreviewErrorBoundary from './components/PreviewErrorBoundary'
import { LoadingFallback } from './components/LoadingFallback'
import { useAutoCompile } from './hooks/useAutoCompile'
import { useFileOps } from './hooks/useFileOps'
import { useSessionRestore } from './hooks/useSessionRestore'
import { useIpcListeners } from './hooks/useIpcListeners'
import { useExternalFileReload } from './hooks/useExternalFileReload'
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
import { useNotificationStore } from './store/useNotificationStore'
import { deactivateProject, openProject } from './utils/openProject'
import { errorMessage, logError } from './utils/errorMessage'
import { isFeatureEnabled } from './utils/featureFlags'
import type { AppCommandId } from '../shared/types'
import { parseAuxContent } from '../shared/auxparser'
import { guidedDemoTemplate } from '../shared/templates'
import { runtimePerformance } from './services/runtimePerformance'
import { prepareForApplicationExit, quitApplication } from './services/applicationLifecycle'
import { checkForAppUpdate } from './services/updateLifecycle'
import { exportDocumentWithFeedback } from './services/documentExportLifecycle'
import {
  canOpenExclusiveAppOverlay,
  containsRenderedBlockingOverlay,
  hasRenderedFeatureModal,
  shouldSuppressBackgroundSurfaces,
  type AppOverlaySnapshot
} from './services/appOverlayPolicy'
import { documentRegistry } from './models/documentRegistry'
import { getDesktopCapabilities } from './platform/capabilities'
import {
  beginCompileTicket,
  cancelPendingAutoCompile,
  canPublishCompileResponse,
  canPublishCompileTicket,
  isLatestCompileTicket,
  toCompileRequest
} from './services/compileCoordinator'
import { ICON_SIZE } from './components/ui/IconSystem'
import { installCrashRecoveryAutosnapshot } from './services/crashRecovery'
import { prepareDocumentsForManualCompile } from './services/compilePersistenceCoordinator'

// Lazy-load heavy modals and panels that are rarely shown
const SettingsModal = lazy(() =>
  import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal }))
)
const DraftModal = lazy(() =>
  import('./components/DraftModal').then((m) => ({ default: m.DraftModal }))
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
const ResearchPanel = lazy(() =>
  import('./components/ResearchPanel').then((module) => ({ default: module.ResearchPanel }))
)
const FileTree = lazy(() => import('./components/FileTree'))
const OutlinePanel = lazy(() => import('./components/OutlinePanel'))
const GitPanel = lazy(() => import('./components/GitPanel'))
const TodoPanel = lazy(() =>
  import('./components/TodoPanel').then((module) => ({ default: module.TodoPanel }))
)
const TimelinePanel = lazy(() =>
  import('./components/TimelinePanel').then((module) => ({ default: module.TimelinePanel }))
)
const CommandPalette = lazy(() =>
  import('./components/CommandPalette').then((module) => ({ default: module.CommandPalette }))
)
const CrashRecoveryDialog = lazy(() =>
  import('./components/CrashRecoveryDialog').then((module) => ({
    default: module.CrashRecoveryDialog
  }))
)
const UpdateNotification = lazy(() => import('./components/UpdateNotification'))
const ExternalChangeBanner = lazy(() => import('./components/ExternalChangeBanner'))
const NotificationCenter = lazy(() => import('./components/NotificationCenter'))
const HomeScreen = lazy(() => import('./components/HomeScreen'))
const BibliographyRegistrationDialog = lazy(() =>
  import('./components/research/BibliographyRegistrationDialog').then((module) => ({
    default: module.BibliographyRegistrationDialog
  }))
)

function App() {
  const { t } = useTranslation()
  const capabilities = getDesktopCapabilities()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const [isFeatureModalOpen, setIsFeatureModalOpen] = useState(false)
  useAutoCompile()
  const { handleOpen, handleSave, handleSaveAs } = useFileOps()

  useEffect(() => {
    runtimePerformance.recordShellInteractive()
  }, [])

  useEffect(() => installCrashRecoveryAutosnapshot(), [])

  // Only subscribe to state needed for rendering
  const splitRatio = usePdfStore((s) => s.splitRatio)
  const terminalRatio = usePdfStore((s) => s.terminalRatio)
  const pdfPath = useCompileStore((s) => s.pdfPath)
  const isSidebarOpen = useProjectStore((s) => s.isSidebarOpen)
  const sidebarView = useProjectStore((s) => s.sidebarView)
  const sidebarWidth = useProjectStore((s) => s.sidebarWidth)
  const isResearchPanelOpen = useProjectStore((s) => s.isResearchPanelOpen)
  const researchPanelWidth = useProjectStore((s) => s.researchPanelWidth)
  const bibliographyRegistrationRequest = useProjectStore((s) => s.bibliographyRegistrationRequest)
  const filePath = useEditorStore((s) => s.filePath)
  const projectRoot = useProjectStore((s) => s.projectRoot)
  const isGitRepo = useProjectStore((s) => s.isGitRepo)
  const settings = useSettingsStore((s) => s.settings)
  const lspEnabled = isFeatureEnabled(settings, 'lsp')
  const gitEnabled = isFeatureEnabled(settings, 'git')
  const autoHideSidebar = useSettingsStore((s) => s.settings.autoHideSidebar)
  const showStatusBar = useSettingsStore((s) => s.settings.showStatusBar)
  const isTerminalPaneOpen = useUiStore((s) => s.isTerminalPaneOpen)
  const terminalPaneOpen = capabilities.pty && isTerminalPaneOpen
  const isTemplateGalleryOpen = useUiStore((s) => s.isTemplateGalleryOpen)
  const updateStatus = useUiStore((s) => s.updateStatus)
  const hasNotifications = useNotificationStore((s) => s.notifications.length > 0)
  const hasActiveExternalChange = useUiStore((s) =>
    Boolean(filePath && s.externalChangeConflicts.includes(filePath))
  )
  const toggleTerminalPane = useUiStore((s) => s.toggleTerminalPane)

  const [isDraftModalOpen, setIsDraftModalOpen] = useState(false)
  const [draftPrefill, setDraftPrefill] = useState<string | undefined>(undefined)

  const overlaySnapshot = useMemo<AppOverlaySnapshot>(
    () => ({
      commandPalette: isCommandPaletteOpen,
      settings: isSettingsOpen,
      aiDraft: isDraftModalOpen,
      templateGallery: isTemplateGalleryOpen,
      featureModal: isFeatureModalOpen
    }),
    [
      isCommandPaletteOpen,
      isDraftModalOpen,
      isFeatureModalOpen,
      isSettingsOpen,
      isTemplateGalleryOpen
    ]
  )
  const commandPaletteVisible =
    isCommandPaletteOpen && canOpenExclusiveAppOverlay('commandPalette', overlaySnapshot)
  const suppressBackgroundSurfaces = shouldSuppressBackgroundSurfaces(overlaySnapshot)

  const handleAiDraft = useCallback(
    (prefill?: string) => {
      if (!capabilities.ai) return
      if (!canOpenExclusiveAppOverlay('aiDraft', overlaySnapshot)) return
      if (hasRenderedFeatureModal(document)) return
      setIsCommandPaletteOpen(false)
      setDraftPrefill(typeof prefill === 'string' ? prefill : undefined)
      setIsDraftModalOpen(true)
    },
    [capabilities.ai, overlaySnapshot]
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
    cancelPendingAutoCompile()
    useCompileStore.getState().clearLogs()
    try {
      await prepareDocumentsForManualCompile(editorState.filePath, snapshot)
    } catch (err) {
      logError('App:preSave', err)
      useCompileStore.getState().appendLog(`Compilation was not started: ${errorMessage(err)}\n`)
      useCompileStore.getState().setCompileStatus('error')
      return
    }
    const ticket = beginCompileTicket(editorState.filePath, snapshot)
    useCompileStore.getState().setCompileStatus('compiling')
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
      useProjectStore
        .getState()
        .setAuxCitationMap(result.auxContent ? parseAuxContent(result.auxContent) : null)
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
      await deactivateProject()
    } catch (err) {
      logError('App:deactivateProject', err)
    }
  }, [])

  const handleExport = useCallback(
    async (format: string): Promise<void> => {
      if (!capabilities.documentExport) return
      const fp = useEditorStore.getState().filePath
      if (!fp) return
      const formatLabel = format.toLocaleUpperCase()
      await exportDocumentWithFeedback(fp, format, {
        exporting: t('notifications.exporting', { format: formatLabel }),
        complete: (outputPath) =>
          t('notifications.exportComplete', { format: formatLabel, path: outputPath }),
        failed: t('notifications.exportFailed', { format: formatLabel }),
        retry: t('notifications.retry')
      })
    },
    [capabilities.documentExport, t]
  )

  const handleOpenTemplateGallery = useCallback(() => {
    if (!capabilities.templates) return
    if (!canOpenExclusiveAppOverlay('templateGallery', overlaySnapshot)) return
    if (hasRenderedFeatureModal(document)) return
    setIsCommandPaletteOpen(false)
    useUiStore.getState().setTemplateGalleryOpen(true)
  }, [capabilities.templates, overlaySnapshot])

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

  const handleOpenGuidedDemo = useCallback(async () => {
    if (!capabilities.templates) return
    try {
      const result = await window.api.createTemplateProject(
        guidedDemoTemplate.name,
        guidedDemoTemplate.content,
        guidedDemoTemplate.files
      )
      if (result) {
        await openProject(result.projectPath)
      }
    } catch (error) {
      logError('App:createGuidedDemo', error)
    }
  }, [capabilities.templates])

  const handleCheckForUpdates = useCallback(async (): Promise<void> => {
    await checkForAppUpdate({ interactive: true })
  }, [])

  const handleRequestWindowClose = useCallback(async (): Promise<void> => {
    await window.api.requestWindowClose()
  }, [])

  const handleQuitApplication = useCallback(async (): Promise<void> => {
    await quitApplication()
  }, [])

  const handleOpenSettings = useCallback((): void => {
    if (!canOpenExclusiveAppOverlay('settings', overlaySnapshot)) return
    if (hasRenderedFeatureModal(document)) return
    setIsCommandPaletteOpen(false)
    setIsSettingsOpen(true)
  }, [overlaySnapshot])

  const openCommandPalette = useCallback((): void => {
    if (!canOpenExclusiveAppOverlay('commandPalette', overlaySnapshot)) return
    if (hasRenderedFeatureModal(document)) return
    setIsCommandPaletteOpen(true)
  }, [overlaySnapshot])

  const runAppCommand = useCallback(
    (command: AppCommandId): void => {
      void executeAppCommand(command, {
        checkForUpdates: handleCheckForUpdates,
        compile: handleCompile,
        openFile: handleOpen,
        openFolder: handleOpenFolder,
        openSettings: handleOpenSettings,
        openTemplateGallery: handleOpenTemplateGallery,
        runAiDraft: () => handleAiDraft(),
        save: handleSave,
        saveAs: handleSaveAs,
        toggleLog: toggleLogPanel,
        toggleTerminal: handleToggleTerminalPane,
        closeWindow: handleRequestWindowClose,
        quitApp: handleQuitApplication,
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
      handleOpenSettings,
      handleOpenTemplateGallery,
      handleQuitApplication,
      handleRequestWindowClose,
      handleSave,
      handleSaveAs,
      handleToggleTerminalPane
    ]
  )

  // ---- Sidebar tab definitions ----
  const allSidebarTabs: { key: SidebarView; label: string; icon: React.ReactNode }[] = [
    { key: 'files', label: t('sidebar.files'), icon: <FolderTree size={ICON_SIZE.compact} /> },
    { key: 'outline', label: t('sidebar.outline'), icon: <ListTree size={ICON_SIZE.compact} /> },
    { key: 'todo', label: t('sidebar.notes'), icon: <StickyNote size={ICON_SIZE.compact} /> },
    { key: 'timeline', label: t('sidebar.timeline'), icon: <Clock size={ICON_SIZE.compact} /> },
    { key: 'git', label: t('sidebar.git'), icon: <GitBranch size={ICON_SIZE.compact} /> }
  ]
  const sidebarTabs = gitEnabled ? allSidebarTabs : allSidebarTabs.filter((t) => t.key !== 'git')

  // ---- Extracted hooks (formerly inline useEffect blocks) ----
  const sessionRestored = useSessionRestore()
  const handleExternalFileChange = useExternalFileReload(projectRoot)
  useIpcListeners(projectRoot, handleExternalFileChange)
  useGitAutoRefresh(projectRoot, isGitRepo, gitEnabled)
  useBibAutoLoad(projectRoot)
  useLspLifecycle(projectRoot, lspEnabled, filePath)
  useKeyboardShortcuts({ runCommand: runAppCommand, openCommandPalette })

  useEffect(() => {
    const updateFeatureModalState = (): void => {
      setIsFeatureModalOpen(hasRenderedFeatureModal(document))
    }
    updateFeatureModalState()
    const observer = new MutationObserver((records) => {
      const overlayChanged = records.some((record) => {
        if (record.type === 'attributes') return true
        return [...record.addedNodes, ...record.removedNodes].some(
          (node) => node instanceof Element && containsRenderedBlockingOverlay(node)
        )
      })
      if (overlayChanged) updateFeatureModalState()
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-modal', 'data-app-overlay-owner']
    })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!isFeatureModalOpen) return
    setIsCommandPaletteOpen(false)
    setIsSettingsOpen(false)
    setIsDraftModalOpen(false)
    setDraftPrefill(undefined)
    if (useUiStore.getState().isTemplateGalleryOpen) {
      useUiStore.getState().setTemplateGalleryOpen(false)
    }
  }, [isFeatureModalOpen])

  useEffect(() => {
    if (isCommandPaletteOpen && !commandPaletteVisible) {
      setIsCommandPaletteOpen(false)
    }
  }, [commandPaletteVisible, isCommandPaletteOpen])

  useEffect(() => {
    window.api.onAppCommand(runAppCommand)
    return () => {
      window.api.removeAppCommandListener()
    }
  }, [runAppCommand])

  useEffect(() => {
    window.api.onWindowCloseRequested(prepareForApplicationExit)
    return () => {
      window.api.removeWindowCloseRequestedListener()
    }
  }, [])
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
    sidebarPosition: 'left',
    sidebarTabs: sidebarTabs.map((tab) => tab.key),
    terminalPaneOpen,
    terminalRatio
  })

  const showHomeScreen = !projectRoot
  const sidebarHandleStyle = autoHideSidebar
    ? { left: `${sidebarWidth}px`, right: 'auto' }
    : undefined
  const sidebarWrapperClass = `sidebar-wrapper sidebar-left${autoHideSidebar ? ' sidebar-auto-hide' : ''}`
  const sidebarElement = (
    <div className={sidebarWrapperClass}>
      <div
        className="sidebar sidebar-left"
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
              aria-label={tab.label}
              aria-pressed={sidebarView === tab.key}
            >
              {tab.icon}
              <span className="sidebar-tab-label">{tab.label}</span>
            </button>
          ))}
          <button
            className="sidebar-pin-btn"
            title={autoHideSidebar ? t('sidebar.pinSidebar') : t('sidebar.unpinSidebar')}
            aria-label={autoHideSidebar ? t('sidebar.pinSidebar') : t('sidebar.unpinSidebar')}
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
            {autoHideSidebar ? (
              <Pin size={ICON_SIZE.compact} />
            ) : (
              <PinOff size={ICON_SIZE.compact} />
            )}
          </button>
        </div>
        <div className={`sidebar-content${slideAnim ? ` sidebar-${slideAnim}` : ''}`}>
          <Suspense fallback={<LoadingFallback variant="panel" label={t('loading.workspace')} />}>
            {sidebarView === 'files' && <FileTree />}
            {sidebarView === 'git' && <GitPanel />}
            {sidebarView === 'outline' && <OutlinePanel />}
            {sidebarView === 'todo' && <TodoPanel />}
            {sidebarView === 'timeline' && <TimelinePanel />}
          </Suspense>
        </div>
      </div>
      <div
        className="sidebar-resize-handle sidebar-left"
        style={sidebarHandleStyle}
        onMouseDown={handleSidebarDividerMouseDown}
        onDoubleClick={handleSidebarDividerDoubleClick}
      />
    </div>
  )

  const appLayoutStyle = {
    '--research-panel-width': `${researchPanelWidth}px`,
    '--research-panel-bottom': showStatusBar ? '25px' : '0px'
  } as CSSProperties

  return (
    <div
      className={`app-container${isResearchPanelOpen ? ' has-research-panel' : ''}`}
      style={appLayoutStyle}
    >
      <Toolbar
        onSave={handleSave}
        onCompile={handleCompile}
        onOpenFolder={handleOpenFolder}
        onReturnHome={handleCloseProject}
        onNewFromTemplate={handleOpenTemplateGallery}
        onAiDraft={handleAiDraft}
        onOpenCommandPalette={openCommandPalette}
        onOpenSettings={handleOpenSettings}
      />
      {isResearchPanelOpen && (
        <Suspense fallback={<LoadingFallback variant="panel" label={t('loading.workspace')} />}>
          <ResearchPanel onAiDraft={() => handleAiDraft()} onCompile={handleCompile} />
        </Suspense>
      )}
      {isSettingsOpen && (
        <Suspense
          fallback={
            <LoadingFallback
              variant="modal"
              label={t('loading.settings')}
              overlayOwner="settings"
            />
          }
        >
          <SettingsModal onClose={() => setIsSettingsOpen(false)} />
        </Suspense>
      )}
      {capabilities.ai && isDraftModalOpen && (
        <Suspense
          fallback={
            <LoadingFallback variant="modal" label={t('loading.aiDraft')} overlayOwner="aiDraft" />
          }
        >
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
      {!suppressBackgroundSurfaces && updateStatus !== 'idle' && (
        <Suspense fallback={null}>
          <UpdateNotification />
        </Suspense>
      )}
      {!suppressBackgroundSurfaces && hasActiveExternalChange && (
        <Suspense fallback={null}>
          <ExternalChangeBanner />
        </Suspense>
      )}
      {!suppressBackgroundSurfaces && hasNotifications && (
        <Suspense fallback={null}>
          <NotificationCenter />
        </Suspense>
      )}
      {commandPaletteVisible && (
        <Suspense fallback={null}>
          <CommandPalette
            isOpen
            onClose={() => setIsCommandPaletteOpen(false)}
            onRunCommand={runAppCommand}
            capabilities={capabilities}
            context={{ document: Boolean(filePath), pdf: Boolean(pdfPath) }}
          />
        </Suspense>
      )}
      {!sessionRestored ? (
        <LoadingFallback variant="workspace" label={t('loading.workspace')} />
      ) : showHomeScreen ? (
        <Suspense fallback={<LoadingFallback variant="workspace" label={t('loading.workspace')} />}>
          <HomeScreen
            onOpenFolder={handleOpenFolder}
            onOpenGuidedDemo={handleOpenGuidedDemo}
            onNewBlankProject={handleNewBlankProject}
            onNewFromTemplate={handleOpenTemplateGallery}
          />
        </Suspense>
      ) : (
        <div className="workspace">
          {(isSidebarOpen || autoHideSidebar) && sidebarElement}
          <div className="editor-area">
            <div
              className={`editor-main-content${terminalPaneOpen ? ' has-terminal-pane' : ''}`}
              ref={mainContentRef}
            >
              <div
                className="editor-pane"
                style={{
                  width: `${splitRatio * (terminalPaneOpen ? 1 - terminalRatio : 1) * 100}%`
                }}
              >
                <TabBar />
                <Suspense fallback={<LoadingFallback variant="pane" label={t('loading.editor')} />}>
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
                  <Suspense
                    fallback={<LoadingFallback variant="pane" label={t('loading.preview')} />}
                  >
                    <PreviewPane />
                  </Suspense>
                </PreviewErrorBoundary>
                {!isResearchPanelOpen && (
                  <button
                    className="research-panel-toggle"
                    onClick={() => useProjectStore.getState().openResearchPanel('references')}
                    title="Open research panel"
                    aria-label="Open research panel"
                  >
                    <PanelRightOpen size={ICON_SIZE.control} />
                  </button>
                )}
              </div>
              {terminalPaneOpen && (
                <>
                  <div
                    className="split-divider terminal-split-divider"
                    onMouseDown={handleTerminalDividerMouseDown}
                    onDoubleClick={handleTerminalDividerDoubleClick}
                  />
                  <div className="terminal-pane" style={{ width: `${terminalRatio * 100}%` }}>
                    <Suspense
                      fallback={<LoadingFallback variant="pane" label={t('loading.terminal')} />}
                    >
                      <TerminalPane />
                    </Suspense>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {bibliographyRegistrationRequest && (
        <Suspense fallback={null}>
          <BibliographyRegistrationDialog />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <CrashRecoveryDialog enabled={sessionRestored} />
      </Suspense>
      {showStatusBar && <StatusBar />}
      {capabilities.templates && isTemplateGalleryOpen && (
        <Suspense
          fallback={
            <LoadingFallback
              variant="modal"
              label={t('loading.templates')}
              overlayOwner="templateGallery"
            />
          }
        >
          <TemplateGallery />
        </Suspense>
      )}
    </div>
  )
}

export default App

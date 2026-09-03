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
import { FolderTree, ListTree, BookOpen, Clock, GitBranch, Pin, PinOff } from 'lucide-react'
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
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useDragResize } from './hooks/useDragResize'
import { useAnimatedPresence } from './hooks/useAnimatedPresence'
import { useHorizontalSwipe } from './hooks/useHorizontalSwipe'
import { useFeatureHints } from './hooks/useFeatureHints'
import {
  executeAppCommand,
  toggleLogPanel,
  toggleProjectSidebar,
  toggleProseMode
} from './services/appCommands'
import { useEditorStore } from './store/useEditorStore'
import { useCompileStore } from './store/useCompileStore'
import { useProjectStore } from './store/useProjectStore'
import type { SidebarView } from './store/useProjectStore'
import { usePdfStore } from './store/usePdfStore'
import { proseModeFor, useUiStore } from './store/useUiStore'
import { useSettingsStore } from './store/useSettingsStore'
import { useNotificationStore } from './store/useNotificationStore'
import { deactivateProject, openProject } from './utils/openProject'
import { logError } from './utils/errorMessage'
import { hasNativeErrorCode } from '../shared/appError'
import { describeNativeError } from './services/nativeErrors'
import { clearCompileFailure, reportCompileFailure } from './services/compileFeedback'
import { isFeatureEnabled } from './utils/featureFlags'
import type { AppCommandId } from '../shared/types'
import type { LearnSectionId } from '../shared/learningIds'
import { parseAuxContent } from '../shared/auxparser'
import { guidedDemoTemplate } from '../shared/templates'
import { runtimePerformance } from './services/runtimePerformance'
import { handleWindowCloseRequest, quitApplication } from './services/applicationLifecycle'
import { checkForAppUpdate } from './services/updateLifecycle'
import { exportDocumentWithFeedback } from './services/documentExportLifecycle'
import {
  canOpenExclusiveAppOverlay,
  shouldSuppressBackgroundSurfaces,
  type AppOverlaySnapshot
} from './services/appOverlayPolicy'
import { documentRegistry } from './models/documentRegistry'
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
import { flushPendingDocumentEdits } from './services/pendingDocumentEdits'
import { SIDEBAR_WIDTH_MAX, SIDEBAR_WIDTH_MIN, SPLIT_RATIO_MAX, SPLIT_RATIO_MIN } from './constants'

// Lazy-load heavy modals and panels that are rarely shown
const SettingsModal = lazy(() =>
  import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal }))
)
const HelpCenter = lazy(() =>
  import('./components/HelpCenter').then((m) => ({ default: m.HelpCenter }))
)
const DraftModal = lazy(() =>
  import('./components/DraftModal').then((m) => ({ default: m.DraftModal }))
)
const TemplateGallery = lazy(() => import('./components/TemplateGallery'))
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
const ReferencesPanel = lazy(() =>
  import('./components/research/ReferencesPanel').then((module) => ({
    default: module.ReferencesPanel
  }))
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
const ProsePane = lazy(() =>
  import('./components/ProsePane').then((module) => ({ default: module.ProsePane }))
)
const ProsePreview = lazy(() =>
  import('./components/ProsePreview').then((module) => ({ default: module.ProsePreview }))
)
const BibliographyRegistrationDialog = lazy(() =>
  import('./components/research/BibliographyRegistrationDialog').then((module) => ({
    default: module.BibliographyRegistrationDialog
  }))
)

function App() {
  const { t } = useTranslation()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [helpReturnsToSettings, setHelpReturnsToSettings] = useState(false)
  const [helpSection, setHelpSection] = useState<LearnSectionId>('quick-start')
  const [pendingHelpCommand, setPendingHelpCommand] = useState<AppCommandId | null>(null)
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  useAutoCompile()
  const { handleOpen, handleSave, handleSaveAs } = useFileOps()

  useEffect(() => {
    runtimePerformance.recordShellInteractive()
  }, [])

  useEffect(() => installCrashRecoveryAutosnapshot(), [])

  // Only subscribe to state needed for rendering
  const splitRatio = usePdfStore((s) => s.splitRatio)
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
  const gitEnabled = isFeatureEnabled(settings, 'git')
  const autoHideSidebar = useSettingsStore((s) => s.settings.autoHideSidebar)
  const autoHideResearchPanel = useSettingsStore((s) => s.settings.autoHideResearchPanel)
  const showStatusBar = useSettingsStore((s) => s.settings.showStatusBar)
  const isTemplateGalleryOpen = useUiStore((s) => s.isTemplateGalleryOpen)
  const updateStatus = useUiStore((s) => s.updateStatus)
  const settingsRequested = useUiStore((s) => s.settingsRequested)
  const helpRequestedSection = useUiStore((s) => s.helpRequestedSection)
  const isProseMode = useUiStore((state) => proseModeFor(state, filePath))
  const pdfViewMode = useSettingsStore((s) => s.settings.pdfViewMode ?? 'continuous')
  const helpHasDocument = Boolean(filePath)
  const helpHasPdf = Boolean(pdfPath)
  const helpHasProject = Boolean(projectRoot)
  const helpContext = useMemo(
    () => ({
      document: helpHasDocument,
      pdf: helpHasPdf,
      project: helpHasProject
    }),
    [helpHasDocument, helpHasPdf, helpHasProject]
  )
  const closeHelp = useCallback((): void => {
    setIsHelpOpen(false)
    setHelpReturnsToSettings(false)
  }, [])
  const returnFromHelpToSettings = useCallback((): void => {
    setIsHelpOpen(false)
    setHelpReturnsToSettings(false)
    setIsSettingsOpen(true)
  }, [])

  // A two-finger horizontal swipe flips the paired workspace TeX/PDF ⇄
  // Markdown/render. In TeX mode only the editor owns this gesture because the
  // PDF preview already uses horizontal swipes for page navigation. Once the
  // Markdown pair is visible, either half can take the author back.
  const handleWorkspaceSwipe = useHorizontalSwipe(useCallback(() => toggleProseMode(), []))
  // Feature dialogs register themselves; App never inspects the DOM for them.
  const isFeatureModalOpen = useUiStore((s) => s.openFeatureModals.length > 0)
  const hasNotifications = useNotificationStore((s) => s.notifications.length > 0)
  const hasActiveExternalChange = useUiStore((s) =>
    Boolean(filePath && s.externalChangeConflicts.includes(filePath))
  )

  const [isDraftModalOpen, setIsDraftModalOpen] = useState(false)
  const [draftPrefill, setDraftPrefill] = useState<string | undefined>(undefined)
  const sidebarPresence = useAnimatedPresence(isSidebarOpen || Boolean(autoHideSidebar))
  const researchPresence = useAnimatedPresence(
    isResearchPanelOpen || Boolean(autoHideResearchPanel)
  )

  useEffect(() => {
    if (!projectRoot || !isSidebarOpen || autoHideSidebar) return

    const closeNarrowDrawer = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || !window.matchMedia('(max-width: 720px)').matches) return
      event.preventDefault()
      toggleProjectSidebar()
    }

    window.addEventListener('keydown', closeNarrowDrawer)
    return () => window.removeEventListener('keydown', closeNarrowDrawer)
  }, [autoHideSidebar, isSidebarOpen, projectRoot])

  const overlaySnapshot = useMemo<AppOverlaySnapshot>(
    () => ({
      commandPalette: isCommandPaletteOpen,
      help: isHelpOpen,
      settings: isSettingsOpen,
      aiDraft: isDraftModalOpen,
      templateGallery: isTemplateGalleryOpen,
      featureModal: isFeatureModalOpen
    }),
    [
      isCommandPaletteOpen,
      isDraftModalOpen,
      isFeatureModalOpen,
      isHelpOpen,
      isSettingsOpen,
      isTemplateGalleryOpen
    ]
  )
  const commandPaletteVisible =
    isCommandPaletteOpen && canOpenExclusiveAppOverlay('commandPalette', overlaySnapshot)
  const suppressBackgroundSurfaces = shouldSuppressBackgroundSurfaces(overlaySnapshot)

  useFeatureHints({
    filePath,
    pdfPath,
    projectRoot,
    pdfViewMode,
    isSidebarOpen,
    isResearchPanelOpen,
    suppressed: suppressBackgroundSurfaces
  })

  const handleAiDraft = useCallback(
    (prefill?: string) => {
      if (!canOpenExclusiveAppOverlay('aiDraft', overlaySnapshot)) return
      setIsCommandPaletteOpen(false)
      setDraftPrefill(typeof prefill === 'string' ? prefill : undefined)
      setIsDraftModalOpen(true)
    },
    [overlaySnapshot]
  )

  const handleDraftInsert = useCallback((latex: string) => {
    useEditorStore.getState().requestInsertAtCursor(latex)
  }, [])

  // ---- Compile handler ----
  const handleCompile = useCallback(async (): Promise<void> => {
    const editorState = useEditorStore.getState()
    if (!editorState.filePath) return
    if (!editorState.filePath.toLowerCase().endsWith('.tex')) return
    flushPendingDocumentEdits(editorState.filePath)
    const snapshot = documentRegistry.snapshot(editorState.filePath)
    if (!snapshot) return
    cancelPendingAutoCompile()
    useCompileStore.getState().clearLogs()
    try {
      await prepareDocumentsForManualCompile(editorState.filePath, snapshot)
    } catch (err) {
      logError('App:preSave', err)
      useCompileStore
        .getState()
        .appendLog(`${t('logPanel.compileNotStarted', { reason: describeNativeError(err) })}\n`)
      useCompileStore.getState().setCompileStatus('error')
      reportCompileFailure(err, 'manual')
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
      clearCompileFailure()
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
      if (hasNativeErrorCode(err, 'compilationCancelled', 'compilationSuperseded')) {
        useCompileStore.getState().setCompileStatus('idle')
        return
      }
      useCompileStore.getState().appendLog(describeNativeError(err))
      useCompileStore.getState().setCompileStatus('error')
      reportCompileFailure(err, 'manual')
    }
  }, [t])

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
    [t]
  )

  const handleOpenTemplateGallery = useCallback(() => {
    if (!canOpenExclusiveAppOverlay('templateGallery', overlaySnapshot)) return
    setIsCommandPaletteOpen(false)
    useUiStore.getState().setTemplateGalleryOpen(true)
  }, [overlaySnapshot])

  const handleNewBlankProject = useCallback(async () => {
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
  }, [])

  const handleOpenGuidedDemo = useCallback(async () => {
    try {
      const result = await window.api.createTemplateProject(
        guidedDemoTemplate.name,
        guidedDemoTemplate.content,
        guidedDemoTemplate.files
      )
      if (result) {
        await openProject(result.projectPath)
        useUiStore.getState().requestHelp('tour')
      }
    } catch (error) {
      logError('App:createGuidedDemo', error)
    }
  }, [])

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
    setIsCommandPaletteOpen(false)
    setIsSettingsOpen(true)
  }, [overlaySnapshot])

  const handleOpenHelp = useCallback(
    (section: LearnSectionId = 'quick-start'): void => {
      // Help may intentionally replace Settings or the command palette, but it
      // never interrupts a draft, template, or feature-owned modal workflow.
      if (
        overlaySnapshot.featureModal ||
        overlaySnapshot.aiDraft ||
        overlaySnapshot.templateGallery
      ) {
        return
      }
      setIsCommandPaletteOpen(false)
      setHelpReturnsToSettings(overlaySnapshot.settings)
      setIsSettingsOpen(false)
      setHelpSection(section)
      setIsHelpOpen(true)
    },
    [overlaySnapshot]
  )

  const openCommandPalette = useCallback((): void => {
    if (!canOpenExclusiveAppOverlay('commandPalette', overlaySnapshot)) return
    setIsCommandPaletteOpen(true)
  }, [overlaySnapshot])

  const runAppCommand = useCallback(
    (command: AppCommandId): void => {
      void executeAppCommand(command, {
        checkForUpdates: handleCheckForUpdates,
        compile: handleCompile,
        openFile: handleOpen,
        openFolder: handleOpenFolder,
        openProjectTerminal: async () => {
          try {
            await window.api.openProjectTerminal()
          } catch (error) {
            useNotificationStore.getState().pushNotification({
              tone: 'error',
              message: describeNativeError(error)
            })
          }
        },
        openHelp: handleOpenHelp,
        openSettings: handleOpenSettings,
        openTemplateGallery: handleOpenTemplateGallery,
        runAiDraft: () => handleAiDraft(),
        save: handleSave,
        saveAs: handleSaveAs,
        toggleLog: toggleLogPanel,
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
      handleOpenHelp,
      handleOpenSettings,
      handleOpenTemplateGallery,
      handleQuitApplication,
      handleRequestWindowClose,
      handleSave,
      handleSaveAs
    ]
  )

  // A guide action closes its modal first. Dispatch on the following render so
  // commands that open another exclusive surface read a current overlay
  // snapshot rather than the Help Center's stale one.
  useEffect(() => {
    if (isHelpOpen || !pendingHelpCommand) return
    setPendingHelpCommand(null)
    runAppCommand(pendingHelpCommand)
  }, [isHelpOpen, pendingHelpCommand, runAppCommand])

  // ---- Sidebar tab definitions ----
  const allSidebarTabs: { key: SidebarView; label: string; icon: React.ReactNode }[] = [
    { key: 'files', label: t('sidebar.files'), icon: <FolderTree size={ICON_SIZE.compact} /> },
    { key: 'outline', label: t('sidebar.outline'), icon: <ListTree size={ICON_SIZE.compact} /> },
    {
      key: 'references',
      label: t('sidebar.references'),
      icon: <BookOpen size={ICON_SIZE.compact} />
    },
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
  useKeyboardShortcuts({ runCommand: runAppCommand, openCommandPalette })

  useEffect(() => {
    if (!isFeatureModalOpen) return
    setIsCommandPaletteOpen(false)
    setIsHelpOpen(false)
    setHelpReturnsToSettings(false)
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

  // Background services (a compile that failed for lack of an engine) ask for
  // Settings through the store; App still owns whether an overlay may open.
  useEffect(() => {
    if (!settingsRequested) return
    useUiStore.getState().clearSettingsRequest()
    handleOpenSettings()
  }, [handleOpenSettings, settingsRequested])

  useEffect(() => {
    if (!helpRequestedSection) return
    useUiStore.getState().clearHelpRequest()
    handleOpenHelp(helpRequestedSection)
  }, [handleOpenHelp, helpRequestedSection])

  useEffect(() => {
    window.api.onAppCommand(runAppCommand)
    return () => {
      window.api.removeAppCommandListener()
    }
  }, [runAppCommand])

  useEffect(() => {
    window.api.onWindowCloseRequested(handleWindowCloseRequest)
    return () => {
      window.api.removeWindowCloseRequestedListener()
    }
  }, [])
  const {
    mainContentRef,
    sidebarRef,
    handleDividerMouseDown,
    handleDividerDoubleClick,
    handleDividerKeyDown,
    handleSidebarDividerMouseDown,
    handleSidebarDividerDoubleClick,
    handleSidebarDividerKeyDown,
    handleSidebarWheel,
    slideAnim
  } = useDragResize({
    sidebarTabs: sidebarTabs.map((tab) => tab.key)
  })

  const showHomeScreen = !projectRoot
  const sidebarHandleStyle = autoHideSidebar
    ? { left: `${sidebarWidth}px`, right: 'auto' }
    : undefined
  const sidebarWrapperClass = `sidebar-wrapper sidebar-left sidebar-shell-${sidebarPresence.phase}${autoHideSidebar ? ' sidebar-auto-hide' : ''}`
  const sidebarElement = (
    <div
      className={sidebarWrapperClass}
      id="project-sidebar"
      style={{ '--sidebar-shell-width': `${sidebarWidth + 5}px` } as CSSProperties}
      aria-hidden={sidebarPresence.phase === 'exiting' ? 'true' : undefined}
      inert={sidebarPresence.phase === 'exiting' ? true : undefined}
    >
      <div
        className="sidebar sidebar-left"
        ref={sidebarRef}
        style={{ width: `${sidebarWidth}px` }}
        onWheel={handleSidebarWheel}
      >
        <div className="sidebar-tabs panel-tabs" role="tablist" aria-label={t('sidebar.label')}>
          {sidebarTabs.map((tab) => (
            <button
              type="button"
              role="tab"
              key={tab.key}
              id={`sidebar-tab-${tab.key}`}
              aria-controls="sidebar-tabpanel"
              className={`sidebar-tab${sidebarView === tab.key ? ' active' : ''}`}
              onClick={() => useProjectStore.getState().setSidebarView(tab.key)}
              title={tab.label}
              aria-label={tab.label}
              aria-selected={sidebarView === tab.key}
            >
              {tab.icon}
              <span className="sidebar-tab-label">{tab.label}</span>
            </button>
          ))}
          <span className="panel-tool-separator" aria-hidden="true" />
          <button
            type="button"
            className="panel-tool-btn"
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
        <div
          className={`sidebar-content${slideAnim ? ` panel-slide-${slideAnim}` : ''}`}
          id="sidebar-tabpanel"
          role="tabpanel"
          aria-labelledby={`sidebar-tab-${sidebarView}`}
        >
          <Suspense fallback={<LoadingFallback variant="panel" label={t('loading.workspace')} />}>
            {sidebarView === 'files' && <FileTree />}
            {sidebarView === 'git' && <GitPanel />}
            {sidebarView === 'outline' && <OutlinePanel />}
            {sidebarView === 'references' && (
              <ReferencesPanel
                onAddToChat={(payload) => {
                  if (!useProjectStore.getState().projectRoot) {
                    useNotificationStore.getState().pushNotification({
                      tone: 'warning',
                      message: t('researchPanel.openProjectForChatReference')
                    })
                    return
                  }
                  useProjectStore.getState().queueChatReference(payload)
                }}
                onOpenProblems={() => useProjectStore.getState().openResearchPanel('problems')}
              />
            )}
            {sidebarView === 'timeline' && <TimelinePanel />}
          </Suspense>
        </div>
      </div>
      <div
        className="sidebar-resize-handle panel-resize-handle sidebar-left"
        style={sidebarHandleStyle}
        onMouseDown={handleSidebarDividerMouseDown}
        onDoubleClick={handleSidebarDividerDoubleClick}
        onKeyDown={handleSidebarDividerKeyDown}
        role="separator"
        tabIndex={0}
        aria-label={t('sidebar.resize')}
        aria-orientation="vertical"
        aria-valuemin={SIDEBAR_WIDTH_MIN}
        aria-valuemax={SIDEBAR_WIDTH_MAX}
        aria-valuenow={Math.round(sidebarWidth)}
      />
    </div>
  )

  const appLayoutStyle = {
    '--research-panel-width': `${researchPanelWidth}px`,
    '--research-panel-bottom': showStatusBar ? '25px' : '0px'
  } as CSSProperties

  return (
    <div
      className={`app-container${isResearchPanelOpen && !autoHideResearchPanel ? ' has-research-panel' : ''}${isSettingsOpen || isHelpOpen ? ' has-app-page' : ''}`}
      style={appLayoutStyle}
    >
      <Toolbar
        onSave={handleSave}
        onCompile={handleCompile}
        onOpenFolder={handleOpenFolder}
        onReturnHome={handleCloseProject}
        onNewFromTemplate={handleOpenTemplateGallery}
        onAiDraft={handleAiDraft}
        onRunCommand={runAppCommand}
        onOpenCommandPalette={openCommandPalette}
        onOpenSettings={handleOpenSettings}
      />
      {projectRoot && researchPresence.mounted && (
        <Suspense fallback={<LoadingFallback variant="panel" label={t('loading.workspace')} />}>
          <ResearchPanel
            onAiDraft={() => handleAiDraft()}
            onCompile={handleCompile}
            presencePhase={researchPresence.phase}
          />
        </Suspense>
      )}
      {isSettingsOpen && (
        <Suspense
          fallback={
            <LoadingFallback variant="page" label={t('loading.settings')} overlayOwner="settings" />
          }
        >
          <SettingsModal onClose={() => setIsSettingsOpen(false)} />
        </Suspense>
      )}
      {isHelpOpen && (
        <Suspense
          fallback={
            <LoadingFallback variant="page" label={t('loading.help')} overlayOwner="help" />
          }
        >
          <HelpCenter
            initialSection={helpSection}
            context={helpContext}
            onClose={closeHelp}
            onBack={helpReturnsToSettings ? returnFromHelpToSettings : undefined}
            onRunCommand={setPendingHelpCommand}
          />
        </Suspense>
      )}
      {isDraftModalOpen && (
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
            context={{
              document: Boolean(filePath),
              pdf: Boolean(pdfPath),
              project: Boolean(projectRoot)
            }}
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
            onOpenHelp={() => handleOpenHelp('quick-start')}
            onNewBlankProject={handleNewBlankProject}
            onNewFromTemplate={handleOpenTemplateGallery}
          />
        </Suspense>
      ) : (
        <div className="workspace">
          {sidebarPresence.mounted && sidebarElement}
          {sidebarPresence.mounted && !autoHideSidebar && (
            <button
              type="button"
              className={`sidebar-drawer-backdrop sidebar-drawer-backdrop-${sidebarPresence.phase}`}
              onClick={toggleProjectSidebar}
              tabIndex={-1}
              aria-hidden="true"
            />
          )}
          <div className="editor-area">
            <div className="editor-main-content" ref={mainContentRef}>
              <div
                className="editor-pane"
                style={{
                  width: `${splitRatio * 100}%`
                }}
              >
                <TabBar />
                {/* Monaco stays mounted behind the prose view: it owns the
                    document adapter the prose edits are applied through, and
                    keeping it alive makes switching back instant. */}
                <div
                  className="editor-surface"
                  data-prose-mode={isProseMode ? 'true' : 'false'}
                  onWheelCapture={handleWorkspaceSwipe}
                >
                  <div className="editor-surface__tex" hidden={isProseMode}>
                    <Suspense
                      fallback={<LoadingFallback variant="pane" label={t('loading.editor')} />}
                    >
                      <EditorPane />
                    </Suspense>
                  </div>
                  {isProseMode && (
                    <Suspense
                      fallback={<LoadingFallback variant="pane" label={t('loading.editor')} />}
                    >
                      <ProsePane key={filePath} />
                    </Suspense>
                  )}
                </div>
              </div>
              <div
                className="split-divider"
                onMouseDown={handleDividerMouseDown}
                onDoubleClick={handleDividerDoubleClick}
                onKeyDown={handleDividerKeyDown}
                role="separator"
                tabIndex={0}
                aria-label={t('toolbar.resizeEditorPreview')}
                aria-orientation="vertical"
                aria-valuemin={Math.round(SPLIT_RATIO_MIN * 100)}
                aria-valuemax={Math.round(SPLIT_RATIO_MAX * 100)}
                aria-valuenow={Math.round(splitRatio * 100)}
              />
              <div
                className="preview-pane"
                data-workspace-view={isProseMode ? 'prose' : 'pdf'}
                onWheelCapture={isProseMode ? handleWorkspaceSwipe : undefined}
                style={{
                  width: `${(1 - splitRatio) * 100}%`
                }}
              >
                <PreviewErrorBoundary>
                  <Suspense
                    fallback={<LoadingFallback variant="pane" label={t('loading.preview')} />}
                  >
                    {/* Prose mode swaps both halves at once: Markdown source on
                        the left, its rendering here in the PDF's slot. */}
                    {isProseMode ? <ProsePreview key={filePath} /> : <PreviewPane />}
                  </Suspense>
                </PreviewErrorBoundary>
              </div>
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
      {isTemplateGalleryOpen && (
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

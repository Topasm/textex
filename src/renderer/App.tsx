import { useCallback, useState } from 'react'
import Toolbar from './components/Toolbar'
import EditorPane from './components/EditorPane'
import PreviewPane from './components/PreviewPane'
import LogPanel from './components/LogPanel'
import StatusBar from './components/StatusBar'
import FileTree from './components/FileTree'
import TabBar from './components/TabBar'
import TemplateGallery from './components/TemplateGallery'
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
import { useGitAutoRefresh } from './hooks/useGitAutoRefresh'
import { useBibAutoLoad } from './hooks/useBibAutoLoad'
import { useLspLifecycle } from './hooks/useLspLifecycle'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useDragResize } from './hooks/useDragResize'
import { SettingsModal } from './components/SettingsModal'
import { DraftModal } from './components/DraftModal'
import { useAppStore } from './store/useAppStore'
import type { SidebarView } from './store/useAppStore'
import { openProject } from './utils/openProject'
import { errorMessage } from './utils/errorMessage'
import { stopLspClient } from './lsp/lspClient'

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  useAutoCompile()
  const { handleOpen, handleSave, handleSaveAs } = useFileOps()

  // Only subscribe to state needed for rendering
  const splitRatio = useAppStore((s) => s.splitRatio)
  const isSidebarOpen = useAppStore((s) => s.isSidebarOpen)
  const sidebarView = useAppStore((s) => s.sidebarView)
  const sidebarWidth = useAppStore((s) => s.sidebarWidth)
  const filePath = useAppStore((s) => s.filePath)
  const projectRoot = useAppStore((s) => s.projectRoot)
  const isGitRepo = useAppStore((s) => s.isGitRepo)
  const lspEnabled = useAppStore((s) => s.settings.lspEnabled)
  const zoteroEnabled = useAppStore((s) => s.settings.zoteroEnabled)
  const gitEnabled = useAppStore((s) => s.settings.gitEnabled)
  const autoHideSidebar = useAppStore((s) => s.settings.autoHideSidebar)
  const showStatusBar = useAppStore((s) => s.settings.showStatusBar)

  const [isDraftModalOpen, setIsDraftModalOpen] = useState(false)
  const [draftPrefill, setDraftPrefill] = useState<string | undefined>(undefined)

  const handleAiDraft = useCallback((prefill?: string) => {
    setDraftPrefill(prefill)
    setIsDraftModalOpen(true)
  }, [])

  const handleDraftInsert = useCallback((latex: string) => {
    useAppStore.getState().setContent(latex)
  }, [])

  // ---- Compile handler ----
  const handleCompile = useCallback(async (): Promise<void> => {
    const state = useAppStore.getState()
    if (!state.filePath) return
    if (!state.filePath.toLowerCase().endsWith('.tex')) return
    try {
      await window.api.saveFile(state.content, state.filePath)
    } catch {
      // continue
    }
    state.setCompileStatus('compiling')
    state.clearLogs()
    try {
      const result = await window.api.compile(state.filePath)
      useAppStore.getState().setPdfBase64(result.pdfBase64)
      useAppStore.getState().setCompileStatus('success')
      const root = useAppStore.getState().projectRoot
      if (root) {
        window.api.scanLabels(root).then((labels) => {
          useAppStore.getState().setLabels(labels)
        }).catch(() => { })
      }
    } catch (err: unknown) {
      const s = useAppStore.getState()
      s.appendLog(errorMessage(err))
      s.setCompileStatus('error')
      s.setLogPanelOpen(true)
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
    try { await window.api.unwatchDirectory() } catch { /* ignore */ }
    stopLspClient()
    useAppStore.getState().closeProject()
  }, [])

  const handleExport = useCallback(async (format: string): Promise<void> => {
    const s = useAppStore.getState()
    if (!s.filePath) return
    s.setExportStatus('exporting')
    try {
      const result = await window.api.exportDocument(s.filePath, format)
      useAppStore.getState().setExportStatus(result?.success ? 'success' : 'error')
    } catch (err: unknown) {
      const s2 = useAppStore.getState()
      s2.appendLog(`Export failed: ${errorMessage(err)}`)
      s2.setExportStatus('error')
    }
  }, [])

  // ---- Extracted hooks (formerly inline useEffect blocks) ----
  const sessionRestored = useSessionRestore()
  useIpcListeners(projectRoot)
  useGitAutoRefresh(projectRoot, isGitRepo, gitEnabled)
  useBibAutoLoad(projectRoot)
  useLspLifecycle(projectRoot, lspEnabled, filePath)
  useKeyboardShortcuts({ handleOpen, handleSave, handleSaveAs, handleCompile, handleAiDraft, zoteroEnabled })
  const {
    mainContentRef, sidebarRef,
    handleDividerMouseDown, handleDividerDoubleClick,
    handleSidebarDividerMouseDown, handleSidebarDividerDoubleClick,
    handleSidebarWheel, slideAnim
  } = useDragResize()

  // ---- Sidebar tab definitions ----
  const allSidebarTabs: { key: SidebarView; label: string }[] = [
    { key: 'files', label: 'Files' },
    { key: 'bib', label: 'Bib' },
    { key: 'outline', label: 'Outline' },
    { key: 'todo', label: 'Notes' },
    { key: 'timeline', label: 'Timeline' },
    { key: 'git', label: 'Git' }
  ]
  const sidebarTabs = gitEnabled !== false
    ? allSidebarTabs
    : allSidebarTabs.filter((t) => t.key !== 'git')

  const showHomeScreen = sessionRestored && !projectRoot

  return (
    <div className="app-container">
      <Toolbar
        onOpen={handleOpen}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onCompile={handleCompile}
        onToggleLog={() => useAppStore.getState().toggleLogPanel()}
        onOpenFolder={handleOpenFolder}
        onReturnHome={handleCloseProject}
        onNewFromTemplate={() => useAppStore.getState().toggleTemplateGallery()}
        onAiDraft={() => handleAiDraft()}
        onExport={handleExport}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}
      <DraftModal
        isOpen={isDraftModalOpen}
        onClose={() => { setIsDraftModalOpen(false); setDraftPrefill(undefined) }}
        onInsert={handleDraftInsert}
        initialPrompt={draftPrefill}
      />
      <UpdateNotification />
      {showHomeScreen ? (
        <HomeScreen
          onOpenFolder={handleOpenFolder}
          onNewFromTemplate={() => useAppStore.getState().toggleTemplateGallery()}
          onAiDraft={handleAiDraft}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      ) : (
        <div className="workspace">
          {(isSidebarOpen || autoHideSidebar) && (
            <div className={`sidebar-wrapper${autoHideSidebar ? ' sidebar-auto-hide' : ''}`}>
              <div className="sidebar" ref={sidebarRef} style={{ width: `${sidebarWidth}px` }} onWheel={handleSidebarWheel}>
                <div className="sidebar-tabs">
                  {sidebarTabs.map((tab) => (
                    <button
                      key={tab.key}
                      className={`sidebar-tab${sidebarView === tab.key ? ' active' : ''}`}
                      onClick={() => useAppStore.getState().setSidebarView(tab.key)}
                    >
                      {tab.label}
                    </button>
                  ))}
                  <button
                    className="sidebar-pin-btn"
                    title={autoHideSidebar ? 'Pin sidebar' : 'Unpin sidebar (auto-hide)'}
                    onClick={() => {
                      const store = useAppStore.getState()
                      if (autoHideSidebar) {
                        store.updateSetting('autoHideSidebar', false)
                        if (!store.isSidebarOpen) {
                          store.toggleSidebar()
                        }
                      } else {
                        store.updateSetting('autoHideSidebar', true)
                      }
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      {autoHideSidebar ? (
                        <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a6 6 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182a.5.5 0 0 1-.707-.708l3.182-3.181L2.4 7.328a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a6 6 0 0 1 1.013.16l3.134-3.133a3 3 0 0 1-.04-.461c0-.43.109-1.022.589-1.503a.5.5 0 0 1 .353-.146z" transform="rotate(45, 8, 8)" />
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
              <div
                className="sidebar-resize-handle"
                onMouseDown={handleSidebarDividerMouseDown}
                onDoubleClick={handleSidebarDividerDoubleClick}
              />
            </div>
          )}
          <div className="editor-area">
            <div className="editor-main-content" ref={mainContentRef}>
              <div className="editor-pane" style={{ width: `${splitRatio * 100}%` }}>
                <TabBar />
                <EditorPane />
              </div>
              <div
                className="split-divider"
                onMouseDown={handleDividerMouseDown}
                onDoubleClick={handleDividerDoubleClick}
              />
              <div className="preview-pane" style={{ width: `${(1 - splitRatio) * 100}%` }}>
                <PreviewErrorBoundary>
                  <PreviewPane />
                </PreviewErrorBoundary>
              </div>
            </div>
          </div>
        </div>
      )}
      <LogPanel />
      {showStatusBar && <StatusBar />}
      <TemplateGallery />
    </div>
  )
}

export default App

import { useCallback, useEffect, useRef, useState } from 'react'
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
import { SettingsModal } from './components/SettingsModal'
import { ZoteroCiteModal } from './components/ZoteroCiteModal'
import { DraftModal } from './components/DraftModal'
import { useAppStore } from './store/useAppStore'
import type { SidebarView, LspStatus, } from './store/useAppStore'
import type { Diagnostic } from '../shared/types'
import { openProject } from './utils/openProject'
import { startLspClient, stopLspClient, lspNotifyDidOpen, lspNotifyDidClose, lspNotifyDidChange, lspRequestDocumentSymbols } from './lsp/lspClient'
import { loader } from '@monaco-editor/react'

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [sessionRestored, setSessionRestored] = useState(false)
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
  const zoteroPort = useAppStore((s) => s.settings.zoteroPort)
  const autoHideSidebar = useAppStore((s) => s.settings.autoHideSidebar)
  const showStatusBar = useAppStore((s) => s.settings.showStatusBar)
  const prevFilePathRef = useRef<string | null>(null)

  const [isZoteroModalOpen, setIsZoteroModalOpen] = useState(false)
  const [isDraftModalOpen, setIsDraftModalOpen] = useState(false)
  const [draftPrefill, setDraftPrefill] = useState<string | undefined>(undefined)

  const handleAiDraft = useCallback((prefill?: string) => {
    setDraftPrefill(prefill)
    setIsDraftModalOpen(true)
  }, [])

  const handleZoteroInsert = useCallback((citekeys: string[]) => {
    if (!citekeys.length) return
    const citeCmd = `\\cite{${citekeys.join(',')}}`
    // Insert at cursor position.
    // Since we don't have direct access to Monaco editor instance here easily without
    // refactoring EditorPane, we'll append to content for now or rely on EditorPane
    // exposing a way to insert.
    // Better approach: Update content in store using a helper that inserts at cursor.
    // For this MVP, let's append to logs (debug) and try to insert if we can.
    // Actually, we can use useAppStore's content + cursorLine/Column to splice.
    // BUT, that is complex to get right with lines vs index.
    // Let's assume we just append for now or use a placeholder.
    // Wait, we can use the `setPdfBase64` trick? No.

    // Let's implement a rudimentary insertAtCursor in store or just helper here?
    // EditorPane uses Monaco, which has its own state. The store has `content`.
    // If we update store `content`, EditorPane should update.
    // We need to calculate index from line/col.
    const state = useAppStore.getState()
    const lines = state.content.split('\n')
    // cursorLine is 1-based, cursorColumn is 1-based
    const lineIdx = state.cursorLine - 1
    const colIdx = state.cursorColumn - 1

    if (lineIdx >= 0 && lineIdx < lines.length) {
      const line = lines[lineIdx]
      const before = line.slice(0, colIdx)
      const after = line.slice(colIdx)
      lines[lineIdx] = before + citeCmd + after
      state.setContent(lines.join('\n'))
    } else {
      // Fallback: append
      state.setContent(state.content + '\n' + citeCmd)
    }
    setIsZoteroModalOpen(false)
  }, [])

  const handleDraftInsert = useCallback((latex: string) => {
    useAppStore.getState().setContent(latex)
  }, [])

  const handleZoteroCAYW = useCallback(async () => {
    try {
      const citeCmd = await window.api.zoteroCiteCAYW(zoteroPort)
      if (citeCmd) {
        // Same insertion logic
        const state = useAppStore.getState()
        const lines = state.content.split('\n')
        const lineIdx = state.cursorLine - 1
        const colIdx = state.cursorColumn - 1

        if (lineIdx >= 0 && lineIdx < lines.length) {
          const line = lines[lineIdx]
          const before = line.slice(0, colIdx)
          const after = line.slice(colIdx)
          lines[lineIdx] = before + citeCmd + after
          state.setContent(lines.join('\n'))
        }
      }
    } catch (err) {
      useAppStore.getState().appendLog(`Zotero CAYW Error: ${errorMessage(err)}`)
    }
  }, [zoteroPort])

  // ---- Compile handler ----
  const handleCompile = useCallback(async (): Promise<void> => {
    const state = useAppStore.getState()
    if (!state.filePath) return
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

  // ---- Close project (return to home screen) ----
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

  // ---- On-mount: restore last session ----
  useEffect(() => {
    const restoreSession = async (): Promise<void> => {
      const state = useAppStore.getState()
      const { projectRoot: savedRoot, _sessionOpenPaths, _sessionActiveFile } = state
      if (!savedRoot || _sessionOpenPaths.length === 0) {
        setSessionRestored(true)
        return
      }

      // Read directory tree
      try {
        const tree = await window.api.readDirectory(savedRoot)
        useAppStore.getState().setDirectoryTree(tree)
      } catch {
        // Directory no longer exists — bail out
        useAppStore.getState().setProjectRoot(null)
        setSessionRestored(true)
        return
      }

      // Re-open each file from disk
      for (const fp of _sessionOpenPaths) {
        try {
          const result = await window.api.readFile(fp)
          useAppStore.getState().openFileInTab(result.filePath, result.content)
        } catch {
          // File may have been deleted — skip
        }
      }

      // Restore active tab
      if (_sessionActiveFile && useAppStore.getState().openFiles[_sessionActiveFile]) {
        useAppStore.getState().setActiveTab(_sessionActiveFile)
      }

      // Watch directory
      try {
        await window.api.watchDirectory(savedRoot)
      } catch { /* ignore */ }

      // Git status
      try {
        const isRepo = await window.api.gitIsRepo(savedRoot)
        const s = useAppStore.getState()
        s.setIsGitRepo(isRepo)
        if (isRepo) {
          const status = await window.api.gitStatus(savedRoot)
          s.setGitStatus(status)
          s.setGitBranch(status.branch)
        }
      } catch {
        useAppStore.getState().setIsGitRepo(false)
      }

      // Bib entries
      try {
        const entries = await window.api.findBibInProject(savedRoot)
        useAppStore.getState().setBibEntries(entries)
      } catch { /* ignore */ }

      // Labels
      try {
        const labels = await window.api.scanLabels(savedRoot)
        useAppStore.getState().setLabels(labels)
      } catch { /* ignore */ }

      // Add to recent projects
      try {
        await window.api.addRecentProject(savedRoot)
      } catch { /* ignore */ }

      setSessionRestored(true)
    }

    restoreSession()
  }, [])

  // ---- On-mount: init spell check, check updates ----
  useEffect(() => {
    // Settings are loaded via persist middleware automatically
    // Initialize spell check if enabled
    const settings = useAppStore.getState().settings
    if (settings.spellCheckEnabled) {
      window.api.loadSettings().then((s) => {
        // If we still need to load language setting from backend which might not be in our new store yet
        // Assuming spellInit takes a language code
        window.api.spellInit(s.spellCheckLanguage || 'en-US')
      }).catch(() => { })
    }
    window.api.updateCheck()
  }, [])

  // ---- Update event listeners ----
  useEffect(() => {
    window.api.onUpdateEvent('available', (version: unknown) => {
      useAppStore.getState().setUpdateStatus('available')
      if (typeof version === 'string') {
        useAppStore.getState().setUpdateVersion(version)
      }
    })
    window.api.onUpdateEvent('download-progress', (progress: unknown) => {
      useAppStore.getState().setUpdateStatus('downloading')
      if (typeof progress === 'number') {
        useAppStore.getState().setUpdateProgress(progress)
      }
    })
    window.api.onUpdateEvent('downloaded', () => {
      useAppStore.getState().setUpdateStatus('ready')
    })
    window.api.onUpdateEvent('error', () => {
      useAppStore.getState().setUpdateStatus('error')
    })
    return () => {
      window.api.removeUpdateListeners()
    }
  }, [])

  // ---- Compile log listener ----
  useEffect(() => {
    window.api.onCompileLog((log: string) => {
      useAppStore.getState().appendLog(log)
    })
    return () => {
      window.api.removeCompileLogListener()
    }
  }, [])

  // ---- Diagnostics listener ----
  useEffect(() => {
    window.api.onDiagnostics((diagnostics: Diagnostic[]) => {
      useAppStore.getState().setDiagnostics(diagnostics)
    })
    return () => {
      window.api.removeDiagnosticsListener()
    }
  }, [])

  // ---- Directory watcher refresh ----
  useEffect(() => {
    if (!projectRoot) return
    window.api.onDirectoryChanged(async () => {
      try {
        const tree = await window.api.readDirectory(projectRoot)
        useAppStore.getState().setDirectoryTree(tree)
      } catch {
        // ignore
      }
    })
    return () => {
      window.api.removeDirectoryChangedListener()
    }
  }, [projectRoot])

  // ---- Git auto-refresh (3-second interval) ----
  useEffect(() => {
    if (!projectRoot || !isGitRepo) return
    const interval = setInterval(async () => {
      try {
        const status = await window.api.gitStatus(projectRoot)
        const s = useAppStore.getState()
        s.setGitStatus(status)
        s.setGitBranch(status.branch)
      } catch {
        // ignore
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [projectRoot, isGitRepo])

  // ---- Bib auto-load when projectRoot changes ----
  useEffect(() => {
    if (!projectRoot) return
    window.api
      .findBibInProject(projectRoot)
      .then((entries) => {
        useAppStore.getState().setBibEntries(entries)
      })
      .catch(() => { })
    // Also load citation groups
    window.api
      .loadCitationGroups(projectRoot)
      .then((groups) => {
        useAppStore.getState().setCitationGroups(groups)
      })
      .catch(() => { })
  }, [projectRoot])

  // ---- LSP lifecycle ----
  useEffect(() => {
    if (!projectRoot || !lspEnabled) {
      stopLspClient()
      useAppStore.getState().setLspStatus('stopped')
      return
    }

    let cancelled = false
    loader.init().then((monacoInstance) => {
      if (cancelled) return
      startLspClient(
        projectRoot,
        monacoInstance,
        () => useAppStore.getState().filePath,
        () => useAppStore.getState().content
      ).catch(() => { })
    })

    return () => {
      cancelled = true
      stopLspClient()
    }
  }, [projectRoot, lspEnabled])

  // ---- LSP status listener ----
  useEffect(() => {
    window.api.onLspStatus((status: string, error?: string) => {
      useAppStore.getState().setLspStatus(status as LspStatus)
      useAppStore.getState().setLspError(error || null)
    })
    return () => {
      window.api.removeLspStatusListener()
    }
  }, [])

  // ---- Notify LSP of document changes (debounced via store subscription) ----
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsub = useAppStore.subscribe(
      (state) => state.content,
      (newContent) => {
        clearTimeout(timer)
        timer = setTimeout(() => {
          const state = useAppStore.getState()
          if (state.filePath && state.settings.lspEnabled) {
            lspNotifyDidChange(state.filePath, newContent)
          }
        }, 300)
      }
    )
    return () => {
      clearTimeout(timer)
      unsub()
    }
  }, [])

  // ---- Notify LSP when switching files ----
  useEffect(() => {
    const prevFile = prevFilePathRef.current
    prevFilePathRef.current = filePath

    if (prevFile && prevFile !== filePath) {
      lspNotifyDidClose(prevFile)
    }

    if (filePath) {
      lspNotifyDidOpen(filePath, useAppStore.getState().content)
      const state = useAppStore.getState()
      if (state.settings.lspEnabled && state.lspStatus === 'running') {
        const switchedFile = filePath
        const timer = setTimeout(() => {
          if (useAppStore.getState().filePath === switchedFile) {
            lspRequestDocumentSymbols(switchedFile).then((symbols) => {
              if (useAppStore.getState().filePath === switchedFile) {
                useAppStore.getState().setDocumentSymbols(symbols)
              }
            })
          }
        }, 200)
        return () => clearTimeout(timer)
      }
    } else {
      useAppStore.getState().setDocumentSymbols([])
    }
  }, [filePath])

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return

      const s = useAppStore.getState()

      if (e.key === 'o') {
        e.preventDefault()
        handleOpen()
      } else if (e.key === 's' && e.shiftKey) {
        e.preventDefault()
        handleSaveAs()
      } else if (e.key === 's') {
        e.preventDefault()
        handleSave()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        handleCompile()
      } else if (e.key === 'l') {
        e.preventDefault()
        s.toggleLogPanel()
      } else if ((e.key === '=' || e.key === '+') && e.shiftKey) {
        e.preventDefault()
        s.increaseFontSize()
      } else if (e.key === '-' && e.shiftKey) {
        e.preventDefault()
        s.decreaseFontSize()
      } else if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        s.zoomIn()
      } else if (e.key === '-') {
        e.preventDefault()
        s.zoomOut()
      } else if (e.key === '0') {
        e.preventDefault()
        s.resetZoom()
      } else if (e.key === 'b') {
        e.preventDefault()
        s.toggleSidebar()
      } else if (e.key === 'w') {
        e.preventDefault()
        if (s.activeFilePath) {
          s.closeTab(s.activeFilePath)
        }
      } else if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault()
        const paths = Object.keys(s.openFiles)
        if (paths.length > 1 && s.activeFilePath) {
          const idx = paths.indexOf(s.activeFilePath)
          s.setActiveTab(paths[(idx - 1 + paths.length) % paths.length])
        }
      } else if (e.key === 'Tab') {
        e.preventDefault()
        const paths = Object.keys(s.openFiles)
        if (paths.length > 1 && s.activeFilePath) {
          const idx = paths.indexOf(s.activeFilePath)
          s.setActiveTab(paths[(idx + 1) % paths.length])
        }
      } else if (e.key === 'n' && e.shiftKey) {
        e.preventDefault()
        s.toggleTemplateGallery()
      } else if ((e.key === 'd' || e.key === 'D') && mod && e.shiftKey) {
        e.preventDefault()
        handleAiDraft()
      } else if ((e.key === 'z' || e.key === 'Z') && mod && e.shiftKey) {
        if (zoteroEnabled) {
          e.preventDefault()
          setIsZoteroModalOpen(true)
        }
      } else if ((e.key === 'c' || e.key === 'C') && mod && e.shiftKey) {
        if (zoteroEnabled) {
          e.preventDefault()
          handleZoteroCAYW()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleOpen, handleSave, handleSaveAs, handleCompile, handleAiDraft, handleZoteroCAYW, zoteroEnabled])

  // ---- Split divider drag logic ----
  const mainContentRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (moveEvent: MouseEvent): void => {
      if (!isDragging.current || !mainContentRef.current) return
      const rect = mainContentRef.current.getBoundingClientRect()
      const ratio = (moveEvent.clientX - rect.left) / rect.width
      useAppStore.getState().setSplitRatio(Math.min(0.8, Math.max(0.2, ratio)))
    }

    const onMouseUp = (): void => {
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [])

  const handleDividerDoubleClick = useCallback(() => {
    useAppStore.getState().setSplitRatio(0.5)
  }, [])

  // ---- Sidebar resize drag logic ----
  const isSidebarDragging = useRef(false)

  // ---- Sidebar trackpad swipe to switch tabs ----
  const swipeLocked = useRef(false)
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null)

  const handleSidebarWheel = useCallback((e: React.WheelEvent) => {
    if (swipeLocked.current) return
    // Only respond to horizontal scroll (trackpad two-finger slide)
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
    if (Math.abs(e.deltaX) < 15) return

    const direction = e.deltaX > 0 ? 1 : -1
    swipeLocked.current = true

    const s = useAppStore.getState()
    const tabs: SidebarView[] = ['files', 'git', 'bib', 'outline', 'todo', 'timeline']
    const idx = tabs.indexOf(s.sidebarView)
    const next = tabs[(idx + direction + tabs.length) % tabs.length]

    setSlideDirection(direction > 0 ? 'left' : 'right')
    // Small delay so the exit animation plays, then switch tab
    setTimeout(() => {
      s.setSidebarView(next)
      setSlideDirection(null)
    }, 150)

    // Cooldown before next swipe is accepted
    setTimeout(() => {
      swipeLocked.current = false
    }, 400)
  }, [])

  const handleSidebarDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isSidebarDragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (moveEvent: MouseEvent): void => {
      if (!isSidebarDragging.current) return
      useAppStore.getState().setSidebarWidth(moveEvent.clientX)
    }

    const onMouseUp = (): void => {
      isSidebarDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [])

  // ---- Sidebar tab definitions ----
  const sidebarTabs: { key: SidebarView; label: string }[] = [
    { key: 'files', label: 'Files' },
    { key: 'git', label: 'Git' },
    { key: 'bib', label: 'Bib' },
    { key: 'outline', label: 'Outline' },
    { key: 'todo', label: 'Notes' },
    { key: 'timeline', label: 'Timeline' }
  ]

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
        onZoteroSearch={() => setIsZoteroModalOpen(true)}
        onZoteroCite={handleZoteroCAYW}
      />
      {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}
      <ZoteroCiteModal
        isOpen={isZoteroModalOpen}
        onClose={() => setIsZoteroModalOpen(false)}
        onInsert={handleZoteroInsert}
      />
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
              <div className="sidebar" style={{ width: `${sidebarWidth}px` }} onWheel={handleSidebarWheel}>
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
                      store.updateSetting('autoHideSidebar', !autoHideSidebar)
                      if (autoHideSidebar && !isSidebarOpen) {
                        // Pinning: ensure sidebar stays visible
                        store.toggleSidebar()
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
                <div className={`sidebar-content${slideDirection ? ` sidebar-slide-${slideDirection}` : ''}`}>
                  {sidebarView === 'files' && <FileTree />}
                  {sidebarView === 'git' && <GitPanel />}
                  {sidebarView === 'bib' && <BibPanel />}
                  {sidebarView === 'outline' && <OutlinePanel />}
                  {sidebarView === 'todo' && <TodoPanel />}
                  {sidebarView === 'timeline' && <TimelinePanel />}
                </div>
              </div>
              {!autoHideSidebar && (
                <div
                  className="sidebar-resize-handle"
                  onMouseDown={handleSidebarDividerMouseDown}
                />
              )}
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

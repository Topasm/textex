import { useCallback, useEffect, useRef } from 'react'
import Toolbar from './components/Toolbar'
import EditorPane from './components/EditorPane'
import PreviewPane from './components/PreviewPane'
import LogPanel from './components/LogPanel'
import StatusBar from './components/StatusBar'
import FileTree from './components/FileTree'
import TabBar from './components/TabBar'
import TemplateGallery from './components/TemplateGallery'
import BibPanel from './components/BibPanel'
import GitPanel from './components/GitPanel'
import UpdateNotification from './components/UpdateNotification'
import PreviewErrorBoundary from './components/PreviewErrorBoundary'
import { useAutoCompile } from './hooks/useAutoCompile'
import { useFileOps } from './hooks/useFileOps'
import { useAppStore } from './store/useAppStore'
import type { SidebarView, LspStatus } from './store/useAppStore'
import { startLspClient, stopLspClient, lspNotifyDidOpen, lspNotifyDidChange } from './lsp/lspClient'
import { loader } from '@monaco-editor/react'

function App(): JSX.Element {
  useAutoCompile()
  const { handleOpen, handleSave, handleSaveAs } = useFileOps()

  // Existing store selectors
  const toggleLogPanel = useAppStore((s) => s.toggleLogPanel)
  const zoomIn = useAppStore((s) => s.zoomIn)
  const zoomOut = useAppStore((s) => s.zoomOut)
  const resetZoom = useAppStore((s) => s.resetZoom)
  const splitRatio = useAppStore((s) => s.splitRatio)
  const setSplitRatio = useAppStore((s) => s.setSplitRatio)
  const filePath = useAppStore((s) => s.filePath)
  const setCompileStatus = useAppStore((s) => s.setCompileStatus)
  const setPdfBase64 = useAppStore((s) => s.setPdfBase64)
  const appendLog = useAppStore((s) => s.appendLog)
  const clearLogs = useAppStore((s) => s.clearLogs)
  const setLogPanelOpen = useAppStore((s) => s.setLogPanelOpen)

  // New store selectors
  const isSidebarOpen = useAppStore((s) => s.isSidebarOpen)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const sidebarView = useAppStore((s) => s.sidebarView)
  const setSidebarView = useAppStore((s) => s.setSidebarView)
  const sidebarWidth = useAppStore((s) => s.sidebarWidth)
  const setSidebarWidth = useAppStore((s) => s.setSidebarWidth)
  const projectRoot = useAppStore((s) => s.projectRoot)
  const setProjectRoot = useAppStore((s) => s.setProjectRoot)
  const setDirectoryTree = useAppStore((s) => s.setDirectoryTree)
  const closeTab = useAppStore((s) => s.closeTab)
  const setActiveTab = useAppStore((s) => s.setActiveTab)
  const toggleTemplateGallery = useAppStore((s) => s.toggleTemplateGallery)
  const setExportStatus = useAppStore((s) => s.setExportStatus)
  const setUpdateStatus = useAppStore((s) => s.setUpdateStatus)
  const setUpdateVersion = useAppStore((s) => s.setUpdateVersion)
  const setUpdateProgress = useAppStore((s) => s.setUpdateProgress)
  const isGitRepo = useAppStore((s) => s.isGitRepo)
  const setIsGitRepo = useAppStore((s) => s.setIsGitRepo)
  const setGitBranch = useAppStore((s) => s.setGitBranch)
  const setGitStatus = useAppStore((s) => s.setGitStatus)
  const setBibEntries = useAppStore((s) => s.setBibEntries)
  const setLabels = useAppStore((s) => s.setLabels)
  const loadUserSettings = useAppStore((s) => s.loadUserSettings)
  const setTheme = useAppStore((s) => s.setTheme)
  const increaseFontSize = useAppStore((s) => s.increaseFontSize)
  const decreaseFontSize = useAppStore((s) => s.decreaseFontSize)
  const lspEnabled = useAppStore((s) => s.lspEnabled)
  const setLspStatus = useAppStore((s) => s.setLspStatus)

  // ---- Compile handler (existing) ----
  const handleCompile = useCallback(async (): Promise<void> => {
    if (!filePath) return
    const content = useAppStore.getState().content
    try {
      await window.api.saveFile(content, filePath)
    } catch {
      // continue
    }
    setCompileStatus('compiling')
    clearLogs()
    try {
      const result = await window.api.compile(filePath)
      setPdfBase64(result.pdfBase64)
      setCompileStatus('success')
      // Scan labels after successful compilation
      const root = useAppStore.getState().projectRoot
      if (root) {
        window.api.scanLabels(root).then((labels) => {
          useAppStore.getState().setLabels(labels)
        }).catch(() => {})
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      appendLog(message)
      setCompileStatus('error')
      setLogPanelOpen(true)
    }
  }, [filePath, setCompileStatus, setPdfBase64, appendLog, clearLogs, setLogPanelOpen])

  // ---- New handlers ----

  const handleOpenFolder = useCallback(async (): Promise<void> => {
    const dirPath = await window.api.openDirectory()
    if (!dirPath) return

    setProjectRoot(dirPath)

    let tree: DirectoryEntry[] = []
    try {
      tree = await window.api.readDirectory(dirPath)
      setDirectoryTree(tree)
    } catch {
      // ignore
    }

    // Open sidebar to files view
    if (!useAppStore.getState().isSidebarOpen) {
      toggleSidebar()
    }
    setSidebarView('files')

    // Auto-open the first .tex file found in the folder
    const texFile = tree.find((e) => e.type === 'file' && e.name.endsWith('.tex'))
    if (texFile) {
      try {
        const result = await window.api.readFile(texFile.path)
        useAppStore.getState().openFileInTab(result.filePath, result.content)
        useAppStore.getState().setFilePath(result.filePath)
        useAppStore.getState().setDirty(false)
      } catch {
        // ignore
      }
    }

    // Start watching directory
    try {
      await window.api.watchDirectory(dirPath)
    } catch {
      // ignore
    }

    // Check if git repo
    try {
      const isRepo = await window.api.gitIsRepo(dirPath)
      setIsGitRepo(isRepo)
      if (isRepo) {
        const status = await window.api.gitStatus(dirPath)
        setGitStatus(status)
        setGitBranch(status.branch)
      }
    } catch {
      setIsGitRepo(false)
    }

    // Load bib entries
    try {
      const entries = await window.api.findBibInProject(dirPath)
      setBibEntries(entries)
    } catch {
      // ignore
    }

    // Scan labels
    try {
      const labels = await window.api.scanLabels(dirPath)
      setLabels(labels)
    } catch {
      // ignore
    }
  }, [
    setProjectRoot,
    setDirectoryTree,
    toggleSidebar,
    setSidebarView,
    setIsGitRepo,
    setGitStatus,
    setGitBranch,
    setBibEntries,
    setLabels
  ])

  const handleToggleTheme = useCallback((): void => {
    const current = useAppStore.getState().theme
    const next = current === 'dark' ? 'light' : current === 'light' ? 'high-contrast' : 'dark'
    setTheme(next)
  }, [setTheme])

  const handleNewFromTemplate = useCallback((): void => {
    toggleTemplateGallery()
  }, [toggleTemplateGallery])

  const handleExport = useCallback(
    async (format: string): Promise<void> => {
      const currentFilePath = useAppStore.getState().filePath
      if (!currentFilePath) return
      setExportStatus('exporting')
      try {
        const result = await window.api.exportDocument(currentFilePath, format)
        if (result && result.success) {
          setExportStatus('success')
        } else {
          setExportStatus('error')
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        appendLog(`Export failed: ${message}`)
        setExportStatus('error')
      }
    },
    [setExportStatus, appendLog]
  )

  // ---- On-mount: load settings, init spell check, check updates ----
  useEffect(() => {
    window.api.loadSettings().then((settings) => {
      loadUserSettings(settings)
      if (settings.spellCheckEnabled) {
        window.api.spellInit(settings.spellCheckLanguage)
      }
    })
    window.api.updateCheck()
  }, [loadUserSettings])

  // ---- Update event listeners ----
  useEffect(() => {
    window.api.onUpdateEvent('available', (version: unknown) => {
      setUpdateStatus('available')
      if (typeof version === 'string') {
        setUpdateVersion(version)
      }
    })
    window.api.onUpdateEvent('download-progress', (progress: unknown) => {
      setUpdateStatus('downloading')
      if (typeof progress === 'number') {
        setUpdateProgress(progress)
      }
    })
    window.api.onUpdateEvent('downloaded', () => {
      setUpdateStatus('ready')
    })
    window.api.onUpdateEvent('error', () => {
      setUpdateStatus('error')
    })
    return () => {
      window.api.removeUpdateListeners()
    }
  }, [setUpdateStatus, setUpdateVersion, setUpdateProgress])

  // ---- Compile log listener (existing) ----
  useEffect(() => {
    window.api.onCompileLog((log: string) => {
      useAppStore.getState().appendLog(log)
    })
    return () => {
      window.api.removeCompileLogListener()
    }
  }, [])

  // ---- Diagnostics listener (existing) ----
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
        useAppStore.getState().setGitStatus(status)
        useAppStore.getState().setGitBranch(status.branch)
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
      .catch(() => {
        // ignore
      })
  }, [projectRoot])

  // ---- LSP lifecycle ----
  useEffect(() => {
    if (!projectRoot || !lspEnabled) {
      stopLspClient()
      setLspStatus('stopped')
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
      ).then(() => {
        if (cancelled) return
        const state = useAppStore.getState()
        if (state.filePath) {
          lspNotifyDidOpen(state.filePath, state.content)
        }
      }).catch(() => {
        // start failed
      })
    })

    return () => {
      cancelled = true
      stopLspClient()
    }
  }, [projectRoot, lspEnabled, setLspStatus])

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
          if (state.filePath && state.lspEnabled) {
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
    if (filePath) {
      lspNotifyDidOpen(filePath, useAppStore.getState().content)
    }
  }, [filePath])

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return

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
        toggleLogPanel()
      } else if ((e.key === '=' || e.key === '+') && e.shiftKey) {
        // Ctrl+Shift+= -> increase font size
        e.preventDefault()
        increaseFontSize()
      } else if (e.key === '-' && e.shiftKey) {
        // Ctrl+Shift+- -> decrease font size
        e.preventDefault()
        decreaseFontSize()
      } else if (e.key === '=' || e.key === '+') {
        // Ctrl+= -> zoom in (no shift)
        e.preventDefault()
        zoomIn()
      } else if (e.key === '-') {
        // Ctrl+- -> zoom out (no shift)
        e.preventDefault()
        zoomOut()
      } else if (e.key === '0') {
        e.preventDefault()
        resetZoom()
      } else if (e.key === 'b') {
        e.preventDefault()
        toggleSidebar()
      } else if (e.key === 'w') {
        e.preventDefault()
        const currentActive = useAppStore.getState().activeFilePath
        if (currentActive) {
          closeTab(currentActive)
        }
      } else if (e.key === 'Tab' && e.shiftKey) {
        // Ctrl+Shift+Tab -> prev tab
        e.preventDefault()
        const state = useAppStore.getState()
        const paths = Object.keys(state.openFiles)
        if (paths.length > 1 && state.activeFilePath) {
          const idx = paths.indexOf(state.activeFilePath)
          const prev = (idx - 1 + paths.length) % paths.length
          setActiveTab(paths[prev])
        }
      } else if (e.key === 'Tab') {
        // Ctrl+Tab -> next tab
        e.preventDefault()
        const state = useAppStore.getState()
        const paths = Object.keys(state.openFiles)
        if (paths.length > 1 && state.activeFilePath) {
          const idx = paths.indexOf(state.activeFilePath)
          const next = (idx + 1) % paths.length
          setActiveTab(paths[next])
        }
      } else if (e.key === 'n' && e.shiftKey) {
        // Ctrl+Shift+N -> template gallery
        e.preventDefault()
        toggleTemplateGallery()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    handleOpen,
    handleSave,
    handleSaveAs,
    handleCompile,
    toggleLogPanel,
    zoomIn,
    zoomOut,
    resetZoom,
    increaseFontSize,
    decreaseFontSize,
    toggleSidebar,
    closeTab,
    setActiveTab,
    toggleTemplateGallery
  ])

  // ---- Split divider drag logic (existing) ----
  const mainContentRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  const handleDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isDragging.current = true
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      const onMouseMove = (moveEvent: MouseEvent): void => {
        if (!isDragging.current || !mainContentRef.current) return
        const rect = mainContentRef.current.getBoundingClientRect()
        const ratio = (moveEvent.clientX - rect.left) / rect.width
        const clamped = Math.min(0.8, Math.max(0.2, ratio))
        setSplitRatio(clamped)
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
    },
    [setSplitRatio]
  )

  const handleDividerDoubleClick = useCallback(() => {
    setSplitRatio(0.5)
  }, [setSplitRatio])

  // ---- Sidebar resize drag logic ----
  const isSidebarDragging = useRef(false)

  const handleSidebarDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isSidebarDragging.current = true
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      const onMouseMove = (moveEvent: MouseEvent): void => {
        if (!isSidebarDragging.current) return
        setSidebarWidth(moveEvent.clientX)
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
    },
    [setSidebarWidth]
  )

  // ---- Sidebar tab definitions ----
  const sidebarTabs: { key: SidebarView; label: string }[] = [
    { key: 'files', label: 'Files' },
    { key: 'git', label: 'Git' },
    { key: 'bib', label: 'Bib' }
  ]

  return (
    <div className="app-container">
      <Toolbar
        onOpen={handleOpen}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onCompile={handleCompile}
        onToggleLog={toggleLogPanel}
        onOpenFolder={handleOpenFolder}
        onToggleTheme={handleToggleTheme}
        onNewFromTemplate={handleNewFromTemplate}
        onExport={handleExport}
      />
      <UpdateNotification />
      <div className="workspace">
        {isSidebarOpen && (
          <>
            <div className="sidebar" style={{ width: `${sidebarWidth}px` }}>
              <div className="sidebar-tabs">
                {sidebarTabs.map((tab) => (
                  <button
                    key={tab.key}
                    className={`sidebar-tab${sidebarView === tab.key ? ' active' : ''}`}
                    onClick={() => setSidebarView(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="sidebar-content">
                {sidebarView === 'files' && <FileTree />}
                {sidebarView === 'git' && <GitPanel />}
                {sidebarView === 'bib' && <BibPanel />}
              </div>
            </div>
            <div
              className="sidebar-resize-handle"
              onMouseDown={handleSidebarDividerMouseDown}
            />
          </>
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
      <LogPanel />
      <StatusBar />
      <TemplateGallery />
    </div>
  )
}

export default App

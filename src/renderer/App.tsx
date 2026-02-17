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
import StructurePanel from './components/StructurePanel'
import GitPanel from './components/GitPanel'
import UpdateNotification from './components/UpdateNotification'
import PreviewErrorBoundary from './components/PreviewErrorBoundary'
import { useAutoCompile } from './hooks/useAutoCompile'
import { useFileOps } from './hooks/useFileOps'
import { SettingsModal } from './components/SettingsModal'
import { ZoteroCiteModal } from './components/ZoteroCiteModal'
import { useAppStore } from './store/useAppStore'
import type { SidebarView, LspStatus, } from './store/useAppStore'
import type { DirectoryEntry, Diagnostic } from './types/api'
import { startLspClient, stopLspClient, lspNotifyDidOpen, lspNotifyDidClose, lspNotifyDidChange, lspRequestDocumentSymbols } from './lsp/lspClient'
import { loader } from '@monaco-editor/react'

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

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
  const zoteroPort = useAppStore((s) => s.settings.zoteroPort)
  const prevFilePathRef = useRef<string | null>(null)

  const [isZoteroModalOpen, setIsZoteroModalOpen] = useState(false)

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

    useAppStore.getState().setProjectRoot(dirPath)

    let tree: DirectoryEntry[] = []
    try {
      tree = await window.api.readDirectory(dirPath)
      useAppStore.getState().setDirectoryTree(tree)
    } catch {
      // ignore
    }

    if (!useAppStore.getState().isSidebarOpen) {
      useAppStore.getState().toggleSidebar()
    }
    useAppStore.getState().setSidebarView('files')

    // Auto-open first .tex file
    const texFile = tree.find((e) => e.type === 'file' && e.name.endsWith('.tex'))
    if (texFile) {
      try {
        const result = await window.api.readFile(texFile.path)
        const s = useAppStore.getState()
        s.openFileInTab(result.filePath, result.content)
        s.setFilePath(result.filePath)
        s.setDirty(false)
      } catch {
        // ignore
      }
    }

    try {
      await window.api.watchDirectory(dirPath)
    } catch {
      // ignore
    }

    try {
      const isRepo = await window.api.gitIsRepo(dirPath)
      const s = useAppStore.getState()
      s.setIsGitRepo(isRepo)
      if (isRepo) {
        const status = await window.api.gitStatus(dirPath)
        s.setGitStatus(status)
        s.setGitBranch(status.branch)
      }
    } catch {
      useAppStore.getState().setIsGitRepo(false)
    }

    try {
      const entries = await window.api.findBibInProject(dirPath)
      useAppStore.getState().setBibEntries(entries)
    } catch {
      // ignore
    }

    try {
      const labels = await window.api.scanLabels(dirPath)
      useAppStore.getState().setLabels(labels)
    } catch {
      // ignore
    }
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
  }, [handleOpen, handleSave, handleSaveAs, handleCompile, handleZoteroCAYW, zoteroEnabled])

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
    { key: 'structure', label: 'Structure' }
  ]

  return (
    <div className="app-container">
      <Toolbar
        onOpen={handleOpen}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onCompile={handleCompile}
        onToggleLog={() => useAppStore.getState().toggleLogPanel()}
        onOpenFolder={handleOpenFolder}

        onNewFromTemplate={() => useAppStore.getState().toggleTemplateGallery()}
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
                    onClick={() => useAppStore.getState().setSidebarView(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="sidebar-content">
                {sidebarView === 'files' && <FileTree />}
                {sidebarView === 'git' && <GitPanel />}
                {sidebarView === 'bib' && <BibPanel />}
                {sidebarView === 'structure' && <StructurePanel />}
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

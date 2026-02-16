import { useCallback, useEffect, useRef } from 'react'
import Toolbar from './components/Toolbar'
import EditorPane from './components/EditorPane'
import PreviewPane from './components/PreviewPane'
import LogPanel from './components/LogPanel'
import StatusBar from './components/StatusBar'
import { useAutoCompile } from './hooks/useAutoCompile'
import { useFileOps } from './hooks/useFileOps'
import { useAppStore } from './store/useAppStore'

function App(): JSX.Element {
  useAutoCompile()
  const { handleOpen, handleSave, handleSaveAs } = useFileOps()
  const toggleLogPanel = useAppStore((s) => s.toggleLogPanel)
  const splitRatio = useAppStore((s) => s.splitRatio)
  const setSplitRatio = useAppStore((s) => s.setSplitRatio)
  const filePath = useAppStore((s) => s.filePath)
  const setCompileStatus = useAppStore((s) => s.setCompileStatus)
  const setPdfBase64 = useAppStore((s) => s.setPdfBase64)
  const appendLog = useAppStore((s) => s.appendLog)
  const clearLogs = useAppStore((s) => s.clearLogs)
  const setLogPanelOpen = useAppStore((s) => s.setLogPanelOpen)

  const handleCompile = useCallback(async (): Promise<void> => {
    if (!filePath) return
    // getState() is intentional here: reads latest content at call time
    // without subscribing the component to content changes.
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      appendLog(message)
      setCompileStatus('error')
      setLogPanelOpen(true)
    }
  }, [filePath, setCompileStatus, setPdfBase64, appendLog, clearLogs, setLogPanelOpen])

  useEffect(() => {
    window.api.onCompileLog((log: string) => {
      useAppStore.getState().appendLog(log)
    })
    return () => {
      window.api.removeCompileLogListener()
    }
  }, [])

  // Wire up diagnostics listener
  useEffect(() => {
    window.api.onDiagnostics((diagnostics: Diagnostic[]) => {
      useAppStore.getState().setDiagnostics(diagnostics)
    })
    return () => {
      window.api.removeDiagnosticsListener()
    }
  }, [])

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
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleOpen, handleSave, handleSaveAs, handleCompile, toggleLogPanel])

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
  }, [setSplitRatio])

  const handleDividerDoubleClick = useCallback(() => {
    setSplitRatio(0.5)
  }, [setSplitRatio])

  return (
    <div className="app-container">
      <Toolbar
        onOpen={handleOpen}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onCompile={handleCompile}
        onToggleLog={toggleLogPanel}
      />
      <div className="main-content" ref={mainContentRef}>
        <div className="editor-pane" style={{ width: `${splitRatio * 100}%` }}>
          <EditorPane />
        </div>
        <div
          className="split-divider"
          onMouseDown={handleDividerMouseDown}
          onDoubleClick={handleDividerDoubleClick}
        />
        <div className="preview-pane" style={{ width: `${(1 - splitRatio) * 100}%` }}>
          <PreviewPane />
        </div>
      </div>
      <LogPanel />
      <StatusBar />
    </div>
  )
}

export default App

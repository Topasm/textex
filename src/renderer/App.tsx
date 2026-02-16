import { useEffect } from 'react'
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
  const filePath = useAppStore((s) => s.filePath)
  const setCompileStatus = useAppStore((s) => s.setCompileStatus)
  const setPdfBase64 = useAppStore((s) => s.setPdfBase64)
  const appendLog = useAppStore((s) => s.appendLog)
  const clearLogs = useAppStore((s) => s.clearLogs)
  const setLogPanelOpen = useAppStore((s) => s.setLogPanelOpen)

  const handleCompile = async (): Promise<void> => {
    if (!filePath) return
    const content = useAppStore.getState().content
    // Save first
    try {
      await window.api.saveFile(content, filePath)
    } catch {
      // continue to compile
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
  }

  // Register compile log listener
  useEffect(() => {
    window.api.onCompileLog((log: string) => {
      useAppStore.getState().appendLog(log)
    })
    return () => {
      window.api.removeCompileLogListener()
    }
  }, [])

  // Keyboard shortcuts
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
  }, [handleOpen, handleSave, handleSaveAs, toggleLogPanel, filePath])

  return (
    <div className="flex flex-col h-screen bg-[#1e1e1e]">
      <Toolbar
        onOpen={handleOpen}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onCompile={handleCompile}
        onToggleLog={toggleLogPanel}
      />
      <div className="flex flex-1 min-h-0">
        <div className="w-1/2 border-r border-[#333333]">
          <EditorPane />
        </div>
        <div className="w-1/2">
          <PreviewPane />
        </div>
      </div>
      <LogPanel />
      <StatusBar />
    </div>
  )
}

export default App

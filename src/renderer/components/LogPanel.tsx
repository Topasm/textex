import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'

function LogPanel(): JSX.Element | null {
  const isLogPanelOpen = useAppStore((s) => s.isLogPanelOpen)
  const logs = useAppStore((s) => s.logs)
  const clearLogs = useAppStore((s) => s.clearLogs)
  const toggleLogPanel = useAppStore((s) => s.toggleLogPanel)
  const scrollRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs])

  if (!isLogPanelOpen) return null

  return (
    <div className="log-panel">
      <div className="log-panel-header">
        <span>Compilation Log</span>
        <div className="log-actions">
          <button onClick={clearLogs}>Clear</button>
          <button onClick={toggleLogPanel}>Close</button>
        </div>
      </div>
      <pre ref={scrollRef}>
        {logs || 'No output yet.'}
      </pre>
    </div>
  )
}

export default LogPanel

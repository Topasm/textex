import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'

function LogPanel(): JSX.Element | null {
  const isLogPanelOpen = useAppStore((s) => s.isLogPanelOpen)
  const logs = useAppStore((s) => s.logs)
  const diagnostics = useAppStore((s) => s.diagnostics)
  const logViewMode = useAppStore((s) => s.logViewMode)
  const setLogViewMode = useAppStore((s) => s.setLogViewMode)
  const clearLogs = useAppStore((s) => s.clearLogs)
  const toggleLogPanel = useAppStore((s) => s.toggleLogPanel)
  const requestJumpToLine = useAppStore((s) => s.requestJumpToLine)
  const scrollRef = useRef<HTMLPreElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logViewMode === 'raw' && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs, logViewMode])

  if (!isLogPanelOpen) return null

  const handleEntryClick = (line: number, column?: number): void => {
    requestJumpToLine(line, column ?? 1)
  }

  const severityIcon = (severity: DiagnosticSeverity): string => {
    switch (severity) {
      case 'error': return '\u2716'   // heavy multiplication x
      case 'warning': return '\u26A0' // warning sign
      default: return '\u2139'        // info
    }
  }

  return (
    <div className="log-panel">
      <div className="log-panel-header">
        <span>Compilation Log</span>
        <div className="log-actions">
          <button
            className={logViewMode === 'structured' ? 'log-tab-active' : ''}
            onClick={() => setLogViewMode('structured')}
          >
            Problems
          </button>
          <button
            className={logViewMode === 'raw' ? 'log-tab-active' : ''}
            onClick={() => setLogViewMode('raw')}
          >
            Output
          </button>
          <button onClick={clearLogs}>Clear</button>
          <button onClick={toggleLogPanel}>Close</button>
        </div>
      </div>
      {logViewMode === 'raw' ? (
        <pre ref={scrollRef}>
          {logs || 'No output yet.'}
        </pre>
      ) : (
        <div ref={listRef} className="log-structured">
          {diagnostics.length === 0 ? (
            <div className="log-empty">No problems detected.</div>
          ) : (
            diagnostics.map((d, i) => (
              <div
                key={i}
                className={`log-entry log-entry-${d.severity}`}
                onClick={() => handleEntryClick(d.line, d.column)}
              >
                <span className="log-entry-icon">{severityIcon(d.severity)}</span>
                <span className="log-entry-location">
                  {d.file ? d.file.split('/').pop() : ''}:{d.line}
                </span>
                <span className="log-entry-message">{d.message}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default LogPanel

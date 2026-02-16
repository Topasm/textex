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
    <div className="border-t border-[#333333] bg-[#1e1e1e]">
      <div className="flex items-center justify-between px-3 py-1 bg-[#252526] border-b border-[#333333]">
        <span className="text-xs text-[#999999] uppercase tracking-wide">Compilation Log</span>
        <div className="flex gap-2">
          <button
            onClick={clearLogs}
            className="text-xs text-[#999999] hover:text-[#cccccc] transition-colors"
          >
            Clear
          </button>
          <button
            onClick={toggleLogPanel}
            className="text-xs text-[#999999] hover:text-[#cccccc] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
      <pre
        ref={scrollRef}
        className="h-40 overflow-auto p-3 text-xs font-mono text-[#cccccc] whitespace-pre-wrap"
      >
        {logs || 'No output yet.'}
      </pre>
    </div>
  )
}

export default LogPanel

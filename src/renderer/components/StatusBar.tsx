import { useAppStore } from '../store/useAppStore'

function StatusBar(): JSX.Element {
  const compileStatus = useAppStore((s) => s.compileStatus)
  const cursorLine = useAppStore((s) => s.cursorLine)
  const cursorColumn = useAppStore((s) => s.cursorColumn)
  const diagnostics = useAppStore((s) => s.diagnostics)

  const statusConfig = {
    idle: { dotClass: 'green', label: 'Ready' },
    compiling: { dotClass: 'yellow', label: 'Compiling...' },
    success: { dotClass: 'green', label: 'Success' },
    error: { dotClass: 'red', label: 'Error' }
  }

  const { dotClass, label } = statusConfig[compileStatus]

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length
  const warnCount = diagnostics.filter((d) => d.severity === 'warning').length

  return (
    <div className="status-bar">
      <div className="status-left">
        <span className={`status-dot ${dotClass}`} />
        <span>{label}</span>
        {(errorCount > 0 || warnCount > 0) && (
          <span className="status-diagnostics">
            {errorCount > 0 && <span className="status-errors">{'\u2716'} {errorCount}</span>}
            {warnCount > 0 && <span className="status-warnings">{'\u26A0'} {warnCount}</span>}
          </span>
        )}
      </div>
      <div>Ln {cursorLine}, Col {cursorColumn}</div>
    </div>
  )
}

export default StatusBar

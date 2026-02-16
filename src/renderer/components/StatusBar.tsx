import { useAppStore } from '../store/useAppStore'

function StatusBar(): JSX.Element {
  const compileStatus = useAppStore((s) => s.compileStatus)
  const cursorLine = useAppStore((s) => s.cursorLine)
  const cursorColumn = useAppStore((s) => s.cursorColumn)

  const statusConfig = {
    idle: { dotClass: 'green', label: 'Ready' },
    compiling: { dotClass: 'yellow', label: 'Compiling...' },
    success: { dotClass: 'green', label: 'Success' },
    error: { dotClass: 'red', label: 'Error' }
  }

  const { dotClass, label } = statusConfig[compileStatus]

  return (
    <div className="status-bar">
      <div className="status-left">
        <span className={`status-dot ${dotClass}`} />
        <span>{label}</span>
      </div>
      <div>Ln {cursorLine}, Col {cursorColumn}</div>
    </div>
  )
}

export default StatusBar

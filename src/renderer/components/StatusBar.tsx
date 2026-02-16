import { useAppStore } from '../store/useAppStore'

function StatusBar(): JSX.Element {
  const compileStatus = useAppStore((s) => s.compileStatus)
  const cursorLine = useAppStore((s) => s.cursorLine)
  const cursorColumn = useAppStore((s) => s.cursorColumn)

  const statusConfig = {
    idle: { color: 'bg-[#6a9955]', label: 'Ready' },
    compiling: { color: 'bg-[#cca700]', label: 'Compiling...' },
    success: { color: 'bg-[#6a9955]', label: 'Success' },
    error: { color: 'bg-[#f44747]', label: 'Error' }
  }

  const { color, label } = statusConfig[compileStatus]

  return (
    <div className="flex items-center justify-between px-3 py-0.5 bg-[#007acc] text-white text-xs select-none">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${color}`} />
        <span>{label}</span>
      </div>
      <div>
        Ln {cursorLine}, Col {cursorColumn}
      </div>
    </div>
  )
}

export default StatusBar

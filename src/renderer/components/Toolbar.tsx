import { useAppStore } from '../store/useAppStore'

interface ToolbarProps {
  onOpen: () => void
  onSave: () => void
  onSaveAs: () => void
  onCompile: () => void
  onToggleLog: () => void
}

function Toolbar({ onOpen, onSave, onSaveAs, onCompile, onToggleLog }: ToolbarProps): JSX.Element {
  const filePath = useAppStore((s) => s.filePath)
  const isDirty = useAppStore((s) => s.isDirty)
  const compileStatus = useAppStore((s) => s.compileStatus)

  const fileName = filePath ? filePath.split(/[\\/]/).pop() : 'Untitled'
  const dirtyIndicator = isDirty ? ' *' : ''

  return (
    <div className="toolbar">
      <button onClick={onOpen} title="Open (Ctrl+O)">Open</button>
      <button onClick={onSave} title="Save (Ctrl+S)">Save</button>
      <button onClick={onSaveAs} title="Save As (Ctrl+Shift+S)">Save As</button>
      <button
        className="compile-btn"
        onClick={onCompile}
        disabled={compileStatus === 'compiling'}
        title="Compile (Ctrl+Enter)"
      >
        {compileStatus === 'compiling' ? 'Compiling...' : 'Compile'}
      </button>
      <button onClick={onToggleLog} title="Toggle Log (Ctrl+L)">Log</button>
      <span className="file-name">{fileName}{dirtyIndicator}</span>
    </div>
  )
}

export default Toolbar

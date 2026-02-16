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

  return (
    <div className="toolbar">
      <button onClick={onOpen} title="Open file (Ctrl+O)">
        Open<kbd>Ctrl+O</kbd>
      </button>
      <button
        className={isDirty ? 'save-btn-dirty' : undefined}
        onClick={onSave}
        title="Save file (Ctrl+S)"
      >
        Save<kbd>Ctrl+S</kbd>
      </button>
      <button onClick={onSaveAs} title="Save As (Ctrl+Shift+S)">
        Save As<kbd>Ctrl+Shift+S</kbd>
      </button>
      <button
        className="compile-btn"
        onClick={onCompile}
        disabled={compileStatus === 'compiling'}
        title="Compile LaTeX (Ctrl+Enter)"
      >
        {compileStatus === 'compiling' ? 'Compiling...' : 'Compile'}
        <kbd>Ctrl+Enter</kbd>
      </button>
      <button onClick={onToggleLog} title="Toggle log panel (Ctrl+L)">
        Log<kbd>Ctrl+L</kbd>
      </button>
      <span className="file-name">
        {isDirty && <span className="dirty-dot" />}
        {fileName}
      </span>
    </div>
  )
}

export default Toolbar

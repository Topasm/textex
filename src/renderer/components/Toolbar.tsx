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
    <div className="flex items-center gap-2 px-3 py-1.5 bg-[#333333] border-b border-[#252526] select-none">
      <button
        onClick={onOpen}
        className="px-3 py-1 text-sm bg-[#252526] hover:bg-[#3c3c3c] text-[#cccccc] rounded transition-colors"
        title="Open (Ctrl+O)"
      >
        Open
      </button>
      <button
        onClick={onSave}
        className="px-3 py-1 text-sm bg-[#252526] hover:bg-[#3c3c3c] text-[#cccccc] rounded transition-colors"
        title="Save (Ctrl+S)"
      >
        Save
      </button>
      <button
        onClick={onSaveAs}
        className="px-3 py-1 text-sm bg-[#252526] hover:bg-[#3c3c3c] text-[#cccccc] rounded transition-colors"
        title="Save As (Ctrl+Shift+S)"
      >
        Save As
      </button>
      <button
        onClick={onCompile}
        disabled={compileStatus === 'compiling'}
        className="px-3 py-1 text-sm bg-[#007acc] hover:bg-[#005f99] disabled:opacity-50 text-white rounded transition-colors"
        title="Compile (Ctrl+Enter)"
      >
        {compileStatus === 'compiling' ? 'Compiling...' : 'Compile'}
      </button>
      <button
        onClick={onToggleLog}
        className="px-3 py-1 text-sm bg-[#252526] hover:bg-[#3c3c3c] text-[#cccccc] rounded transition-colors"
        title="Toggle Log (Ctrl+L)"
      >
        Log
      </button>

      <div className="ml-auto text-sm text-[#999999]">
        {fileName}
        {dirtyIndicator}
      </div>
    </div>
  )
}

export default Toolbar

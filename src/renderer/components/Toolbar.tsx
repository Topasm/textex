import { useState, useCallback, useEffect, useRef } from 'react'
import { Settings } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

interface ToolbarProps {
  onOpen: () => void
  onSave: () => void
  onSaveAs: () => void
  onCompile: () => void
  onToggleLog: () => void
  onOpenFolder: () => void

  onNewFromTemplate: () => void
  onAiDraft: () => void
  onExport: (format: string) => void
  onOpenSettings: () => void
  onZoteroSearch: () => void
  onZoteroCite: () => void
}

const exportFormats = [
  { name: 'HTML', ext: 'html' },
  { name: 'Word (DOCX)', ext: 'docx' },
  { name: 'OpenDocument (ODT)', ext: 'odt' },
  { name: 'EPUB', ext: 'epub' }
]

function Toolbar({
  onOpen,
  onSave,
  onSaveAs,
  onCompile,
  onToggleLog,
  onOpenFolder,
  onNewFromTemplate,
  onAiDraft,
  onExport,
  onOpenSettings,
  onZoteroSearch,
  onZoteroCite
}: ToolbarProps) {
  const filePath = useAppStore((s) => s.filePath)
  const isDirty = useAppStore((s) => s.isDirty)
  const compileStatus = useAppStore((s) => s.compileStatus)
  const zoteroEnabled = useAppStore((s) => s.settings.zoteroEnabled)

  const [isExportOpen, setIsExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  const fileName = filePath ? filePath.split(/[\\/]/).pop() : 'Untitled'

  const handleExportSelect = useCallback(
    (ext: string) => {
      onExport(ext)
      setIsExportOpen(false)
    },
    [onExport]
  )

  // Close export dropdown when clicking outside
  useEffect(() => {
    if (!isExportOpen) return
    const handleClickOutside = (e: MouseEvent): void => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setIsExportOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isExportOpen])

  return (
    <div className="toolbar">
      <button onClick={onOpen} title="Open file (Ctrl+O)">
        Open<kbd>Ctrl+O</kbd>
      </button>
      <button onClick={onOpenFolder} title="Open folder">
        Open Folder
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

      <span className="toolbar-separator" />

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

      <span className="toolbar-separator" />

      <button onClick={onNewFromTemplate} title="New from template (Ctrl+Shift+N)">
        Template
      </button>
      <button onClick={onAiDraft} title="AI Draft (Ctrl+Shift+D)">
        AI Draft<kbd>Ctrl+Shift+D</kbd>
      </button>

      <div className="export-dropdown" ref={exportRef}>
        <button
          onClick={() => setIsExportOpen(!isExportOpen)}
          title="Export document"
          disabled={!filePath}
        >
          Export {'\u25BE'}
        </button>
        {isExportOpen && (
          <div className="export-dropdown-menu">
            {exportFormats.map((fmt) => (
              <button key={fmt.ext} onClick={() => handleExportSelect(fmt.ext)}>
                {fmt.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <span className="toolbar-separator" />

      <button onClick={onOpenSettings} title="Settings" className="p-1">
        <Settings size={16} />
      </button>

      {zoteroEnabled && (
        <>
          <span className="toolbar-separator" />
          <div className="zotero-toolbar-group" style={{ display: 'flex', gap: '4px' }}>
            <button onClick={onZoteroSearch} title="Search Zotero (Ctrl+Shift+Z)">
              Zotero<kbd>Ctrl+Shift+Z</kbd>
            </button>
            <button onClick={onZoteroCite} title="Zotero Classic Picker (Ctrl+Shift+C)">
              Cite<kbd>Ctrl+Shift+C</kbd>
            </button>
          </div>
        </>
      )}

      <span className="file-name">
        {isDirty && <span className="dirty-dot" />}
        {fileName}
      </span>
    </div>
  )
}

export default Toolbar

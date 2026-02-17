import { useState, useCallback, useEffect, useRef } from 'react'
import { Settings, Home, ChevronDown, Check } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

interface ToolbarProps {
  onOpen: () => void
  onSave: () => void
  onSaveAs: () => void
  onCompile: () => void
  onToggleLog: () => void
  onOpenFolder: () => void
  onReturnHome: () => void
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
  onReturnHome,
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

  // PDF State
  const zoomLevel = useAppStore((s) => s.zoomLevel)
  const synctexHighlight = useAppStore((s) => s.synctexHighlight)

  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false)
  const fileMenuRef = useRef<HTMLDivElement>(null)

  const fileName = filePath ? filePath.split(/[\\/]/).pop() : 'Untitled'

  // Close menus when clicking outside
  useEffect(() => {
    if (!isFileMenuOpen) return
    const handleClickOutside = (e: MouseEvent): void => {
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) {
        setIsFileMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isFileMenuOpen])

  const projectRoot = useAppStore((s) => s.projectRoot)

  // Sync Handlers
  const handleSyncToCode = useCallback(() => {
    useAppStore.getState().triggerSyncToCode()
  }, [])

  const handleSyncToPdf = useCallback(() => {
    const state = useAppStore.getState()
    if (!state.filePath) return
    window.api.synctexForward(state.filePath, state.cursorLine).then((result) => {
      if (result) {
        useAppStore.getState().setSynctexHighlight(result)
      }
    })
  }, [])

  return (
    <div className="toolbar">
      {projectRoot && (
        <button onClick={onReturnHome} title="Return to home screen">
          <Home size={16} />
        </button>
      )}

      {/* File Menu */}
      <div className="menu-dropdown" ref={fileMenuRef}>
        <button onClick={() => setIsFileMenuOpen(!isFileMenuOpen)} title="File operations">
          File <ChevronDown size={12} />
        </button>
        {isFileMenuOpen && (
          <div className="menu-dropdown-content">
            <button onClick={() => { onOpen(); setIsFileMenuOpen(false) }}>
              Open <kbd>Ctrl+O</kbd>
            </button>
            <button onClick={() => { onOpenFolder(); setIsFileMenuOpen(false) }}>
              Open Folder
            </button>
            <button onClick={() => { onSave(); setIsFileMenuOpen(false) }}>
              Save <kbd>Ctrl+S</kbd>
            </button>
            <button onClick={() => { onSaveAs(); setIsFileMenuOpen(false) }}>
              Save As <kbd>Ctrl+Shift+S</kbd>
            </button>
            <div className="toolbar-separator" style={{ height: '1px', width: '100%', margin: '4px 0' }} />
            <button onClick={() => { onNewFromTemplate(); setIsFileMenuOpen(false) }}>
              New from Template
            </button>
            <button onClick={() => { setIsFileMenuOpen(false) }}>
              Export <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>(Coming soon)</span>
            </button>
            {/* Re-add export sub-items if needed, or keep simple for now */}
            {exportFormats.map(fmt => (
              <button key={fmt.ext} onClick={() => { onExport(fmt.ext); setIsFileMenuOpen(false) }} style={{ paddingLeft: '24px' }}>
                Export as {fmt.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        className={isDirty ? 'save-btn-dirty' : undefined}
        onClick={onSave}
        title="Quick Save (Ctrl+S)"
      >
        Save
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
        Log
      </button>

      {useAppStore((s) => !!s.settings.aiProvider) && (
        <button onClick={onAiDraft} title="AI Draft (Ctrl+Shift+D)">
          AI Draft
        </button>
      )}

      <button onClick={onOpenSettings} title="Settings">
        <Settings size={16} />
      </button>

      {zoteroEnabled && (
        <>
          <span className="toolbar-separator" />
          <button onClick={onZoteroSearch} title="Search Zotero (Ctrl+Shift+Z)">
            Zotero
          </button>
          <button onClick={onZoteroCite} title="Zotero Classic Picker (Ctrl+Shift+C)">
            Cite
          </button>
        </>
      )}

      {/* Right side: PDF Controls & File Info */}
      <div className="toolbar-group-right">
        {/* PDF Controls */}
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button onClick={handleSyncToCode} title="Sync PDF to Code (Ctrl+Click in PDF)" style={{ padding: '4px 8px' }}>
            {'\u2190'}
          </button>
          <button onClick={handleSyncToPdf} title="Sync Code to PDF" style={{ padding: '4px 8px' }}>
            {'\u2192'}
          </button>
          <div className="toolbar-separator" />
          <button onClick={() => useAppStore.getState().zoomOut()} disabled={zoomLevel <= 25} title="Zoom Out" style={{ padding: '4px 8px' }}>
            -
          </button>
          <span style={{ fontSize: '12px', minWidth: '36px', textAlign: 'center' }}>{zoomLevel}%</span>
          <button onClick={() => useAppStore.getState().zoomIn()} disabled={zoomLevel >= 400} title="Zoom In" style={{ padding: '4px 8px' }}>
            +
          </button>
          <button onClick={() => useAppStore.getState().resetZoom()} title="Fit Width" style={{ padding: '4px 8px' }}>
            Fit Width
          </button>
        </div>

        <span className="file-name">
          {isDirty && <span className="dirty-dot" />}
          {fileName}
        </span>
      </div>
    </div>
  )
}

export default Toolbar

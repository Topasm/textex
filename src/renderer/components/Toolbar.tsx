import { useState, useCallback, useRef } from 'react'
import { Settings, Home, ChevronDown } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { useClickOutside } from '../hooks/useClickOutside'
import { ZoteroCiteSearch } from './ZoteroCiteSearch'

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
  onOpenSettings
}: ToolbarProps) {
  const filePath = useAppStore((s) => s.filePath)
  const isDirty = useAppStore((s) => s.isDirty)
  const compileStatus = useAppStore((s) => s.compileStatus)
  const zoteroEnabled = useAppStore((s) => s.settings.zoteroEnabled)
  const zoomLevel = useAppStore((s) => s.zoomLevel)
  const projectRoot = useAppStore((s) => s.projectRoot)

  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false)
  const fileMenuRef = useRef<HTMLDivElement>(null)

  const fileName = filePath ? filePath.split(/[\\/]/).pop() : 'Untitled'

  const closeFileMenu = useCallback(() => setIsFileMenuOpen(false), [])
  useClickOutside(fileMenuRef, closeFileMenu, isFileMenuOpen)

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
            <div className="toolbar-separator" style={{ height: '1px', width: '100%', margin: '4px 0' }} />
            <div style={{ padding: '4px 12px', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Export</div>
            {exportFormats.map(fmt => (
              <button key={fmt.ext} onClick={() => { onExport(fmt.ext); setIsFileMenuOpen(false) }} style={{ paddingLeft: '24px' }}>
                {fmt.name}
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
          <ZoteroCiteSearch />
        </>
      )}

      {/* Right side: PDF Controls & File Info */}
      <div className="toolbar-group-right">
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

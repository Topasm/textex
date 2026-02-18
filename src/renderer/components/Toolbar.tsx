import React, { useState, useCallback, useRef } from 'react'
import { Settings, Home, ChevronDown } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { useClickOutside } from '../hooks/useClickOutside'
import { ZoteroCiteSearch } from './ZoteroCiteSearch'
import { isFeatureEnabled } from '../utils/featureFlags'

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

import { EXPORT_FORMATS, ZOOM_MIN, ZOOM_MAX } from '../constants'

const Toolbar = React.memo(function Toolbar({
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
  const settings = useAppStore((s) => s.settings)
  const aiEnabled = isFeatureEnabled(settings, 'ai')
  const zoteroEnabled = isFeatureEnabled(settings, 'zotero')
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
        <button
          onClick={onReturnHome}
          title="Return to home screen"
          aria-label="Return to home screen"
        >
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
            <button
              onClick={() => {
                onOpen()
                setIsFileMenuOpen(false)
              }}
            >
              Open <kbd>Ctrl+O</kbd>
            </button>
            <button
              onClick={() => {
                onOpenFolder()
                setIsFileMenuOpen(false)
              }}
            >
              Open Folder
            </button>
            <button
              onClick={() => {
                onSave()
                setIsFileMenuOpen(false)
              }}
            >
              Save <kbd>Ctrl+S</kbd>
            </button>
            <button
              onClick={() => {
                onSaveAs()
                setIsFileMenuOpen(false)
              }}
            >
              Save As <kbd>Ctrl+Shift+S</kbd>
            </button>
            <div className="toolbar-separator toolbar-separator-line" />
            <button
              onClick={() => {
                onNewFromTemplate()
                setIsFileMenuOpen(false)
              }}
            >
              New from Template
            </button>
            <div className="toolbar-separator toolbar-separator-line" />
            <div className="toolbar-export-header">Export</div>
            {EXPORT_FORMATS.map((fmt) => (
              <button
                key={fmt.ext}
                onClick={() => {
                  onExport(fmt.ext)
                  setIsFileMenuOpen(false)
                }}
                className="toolbar-export-item"
              >
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

      {aiEnabled && (
        <button onClick={onAiDraft} title="AI Draft (Ctrl+Shift+D)">
          AI Draft
        </button>
      )}

      <button onClick={onOpenSettings} title="Settings" aria-label="Settings">
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
        <div className="toolbar-pdf-controls">
          <button
            className="toolbar-compact-btn"
            onClick={handleSyncToCode}
            title="Sync PDF to Code (Ctrl+Click in PDF)"
            aria-label="Sync PDF to Code"
          >
            {'\u2190'}
          </button>
          <button
            className="toolbar-compact-btn"
            onClick={handleSyncToPdf}
            title="Sync Code to PDF"
            aria-label="Sync Code to PDF"
          >
            {'\u2192'}
          </button>
          <div className="toolbar-separator" />
          <button
            className="toolbar-compact-btn"
            onClick={() => useAppStore.getState().zoomOut()}
            disabled={zoomLevel <= ZOOM_MIN}
            title="Zoom Out"
            aria-label="Zoom out"
          >
            -
          </button>
          <span className="toolbar-zoom-label">{zoomLevel}%</span>
          <button
            className="toolbar-compact-btn"
            onClick={() => useAppStore.getState().zoomIn()}
            disabled={zoomLevel >= ZOOM_MAX}
            title="Zoom In"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            className="toolbar-compact-btn"
            onClick={() => useAppStore.getState().resetZoom()}
            title="Fit Width"
          >
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
})

export default Toolbar

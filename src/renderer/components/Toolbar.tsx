import React, { useState, useCallback, useRef } from 'react'
import { Settings, Home, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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

  const fileName = filePath ? filePath.split(/[\\/]/).pop() : t('toolbar.untitled')

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
          title={t('toolbar.returnHome')}
          aria-label={t('toolbar.returnHome')}
        >
          <Home size={16} />
        </button>
      )}

      {/* File Menu */}
      <div className="menu-dropdown" ref={fileMenuRef}>
        <button onClick={() => setIsFileMenuOpen(!isFileMenuOpen)} title={t('toolbar.fileOperations')}>
          {t('toolbar.file')} <ChevronDown size={12} />
        </button>
        {isFileMenuOpen && (
          <div className="menu-dropdown-content">
            <button
              onClick={() => {
                onOpen()
                setIsFileMenuOpen(false)
              }}
            >
              {t('toolbar.open')} <kbd>Ctrl+O</kbd>
            </button>
            <button
              onClick={() => {
                onOpenFolder()
                setIsFileMenuOpen(false)
              }}
            >
              {t('toolbar.openFolder')}
            </button>
            <button
              onClick={() => {
                onSave()
                setIsFileMenuOpen(false)
              }}
            >
              {t('toolbar.save')} <kbd>Ctrl+S</kbd>
            </button>
            <button
              onClick={() => {
                onSaveAs()
                setIsFileMenuOpen(false)
              }}
            >
              {t('toolbar.saveAs')} <kbd>Ctrl+Shift+S</kbd>
            </button>
            <div className="toolbar-separator toolbar-separator-line" />
            <button
              onClick={() => {
                onNewFromTemplate()
                setIsFileMenuOpen(false)
              }}
            >
              {t('toolbar.newFromTemplate')}
            </button>
            <div className="toolbar-separator toolbar-separator-line" />
            <div className="toolbar-export-header">{t('toolbar.export')}</div>
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
        title={t('toolbar.quickSave')}
      >
        {t('toolbar.save')}
      </button>

      <span className="toolbar-separator" />

      <button
        className="compile-btn"
        onClick={onCompile}
        disabled={compileStatus === 'compiling'}
        title={t('toolbar.compileLaTeX')}
      >
        {compileStatus === 'compiling' ? t('toolbar.compiling') : t('toolbar.compile')}
        <kbd>Ctrl+Enter</kbd>
      </button>

      <button onClick={onToggleLog} title={t('toolbar.toggleLog')}>
        {t('toolbar.log')}
      </button>

      {aiEnabled && (
        <button onClick={onAiDraft} title={t('toolbar.aiDraftShortcut')}>
          {t('toolbar.aiDraft')}
        </button>
      )}

      <button onClick={onOpenSettings} title={t('toolbar.settings')} aria-label={t('toolbar.settings')}>
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
            title={t('toolbar.syncPdfToCode')}
            aria-label={t('toolbar.syncPdfToCode')}
          >
            {'\u2190'}
          </button>
          <button
            className="toolbar-compact-btn"
            onClick={handleSyncToPdf}
            title={t('toolbar.syncCodeToPdf')}
            aria-label={t('toolbar.syncCodeToPdf')}
          >
            {'\u2192'}
          </button>
          <div className="toolbar-separator" />
          <button
            className="toolbar-compact-btn"
            onClick={() => useAppStore.getState().zoomOut()}
            disabled={zoomLevel <= ZOOM_MIN}
            title={t('toolbar.zoomOut')}
            aria-label={t('toolbar.zoomOut')}
          >
            -
          </button>
          <span className="toolbar-zoom-label">{zoomLevel}%</span>
          <button
            className="toolbar-compact-btn"
            onClick={() => useAppStore.getState().zoomIn()}
            disabled={zoomLevel >= ZOOM_MAX}
            title={t('toolbar.zoomIn')}
            aria-label={t('toolbar.zoomIn')}
          >
            +
          </button>
          <button
            className="toolbar-compact-btn"
            onClick={() => useAppStore.getState().resetZoom()}
            title={t('toolbar.fitWidth')}
          >
            {t('toolbar.fitWidth')}
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

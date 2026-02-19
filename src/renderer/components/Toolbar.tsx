import React, { useState, useCallback, useRef } from 'react'
import {
  Settings,
  Home,
  ChevronDown,
  Save,
  Play,
  Loader,
  ScrollText,
  Sparkles,
  FileText
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../store/useEditorStore'
import { useCompileStore } from '../store/useCompileStore'
import { useProjectStore } from '../store/useProjectStore'
import { usePdfStore } from '../store/usePdfStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { useClickOutside } from '../hooks/useClickOutside'
import { ZoteroCiteSearch } from './ZoteroCiteSearch'
import PdfZoomDropdown from './PdfZoomDropdown'
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
  const filePath = useEditorStore((s) => s.filePath)
  const isDirty = useEditorStore((s) => s.isDirty)
  const compileStatus = useCompileStore((s) => s.compileStatus)
  const settings = useSettingsStore((s) => s.settings)
  const aiEnabled = isFeatureEnabled(settings, 'ai')
  const zoteroEnabled = isFeatureEnabled(settings, 'zotero')
  const zoomLevel = usePdfStore((s) => s.zoomLevel)
  const currentPage = usePdfStore((s) => s.currentPage)
  const numPages = usePdfStore((s) => s.numPages)
  const projectRoot = useProjectStore((s) => s.projectRoot)

  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false)
  const [pageInputValue, setPageInputValue] = useState('')
  const [isPageInputFocused, setIsPageInputFocused] = useState(false)
  const fileMenuRef = useRef<HTMLDivElement>(null)

  const fileName = filePath ? filePath.split(/[\\/]/).pop() : t('toolbar.untitled')

  const closeFileMenu = useCallback(() => setIsFileMenuOpen(false), [])
  useClickOutside(fileMenuRef, closeFileMenu, isFileMenuOpen)

  // Sync Handlers
  const handleSyncToCode = useCallback(() => {
    usePdfStore.getState().triggerSyncToCode()
  }, [])

  const handleSyncToPdf = useCallback(() => {
    const editorState = useEditorStore.getState()
    if (!editorState.filePath) return
    console.log(`[SyncTeX UI] forward sync: cursorLine=${editorState.cursorLine}, file=${editorState.filePath}`)
    window.api.synctexForward(editorState.filePath, editorState.cursorLine).then((result) => {
      console.log('[SyncTeX UI] forward sync result:', result)
      if (result) {
        usePdfStore.getState().setSynctexHighlight(result)
      }
    })
  }, [])

  // Page navigation handlers
  const handlePrevPage = useCallback(() => {
    const { scrollToPage, currentPage } = usePdfStore.getState()
    if (scrollToPage && currentPage > 1) {
      scrollToPage(currentPage - 1)
    }
  }, [])

  const handleNextPage = useCallback(() => {
    const { scrollToPage, currentPage, numPages } = usePdfStore.getState()
    if (scrollToPage && currentPage < numPages) {
      scrollToPage(currentPage + 1)
    }
  }, [])

  const handlePageInputFocus = useCallback(() => {
    setPageInputValue(String(currentPage))
    setIsPageInputFocused(true)
  }, [currentPage])

  const handlePageInputBlur = useCallback(() => {
    setIsPageInputFocused(false)
    const page = parseInt(pageInputValue, 10)
    if (!isNaN(page) && page >= 1 && page <= numPages) {
      const { scrollToPage } = usePdfStore.getState()
      if (scrollToPage) scrollToPage(page)
    }
    setPageInputValue('')
  }, [pageInputValue, numPages])

  const handlePageInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.currentTarget.blur()
      } else if (e.key === 'Escape') {
        setPageInputValue('')
        setIsPageInputFocused(false)
        e.currentTarget.blur()
      }
    },
    []
  )

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
          <FileText size={16} /> <ChevronDown size={12} />
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
        <Save size={16} />
      </button>

      <span className="toolbar-separator" />

      <button
        className="compile-btn"
        onClick={onCompile}
        disabled={compileStatus === 'compiling'}
        title={t('toolbar.compileLaTeX')}
      >
        {compileStatus === 'compiling' ? <Loader size={16} className="spin" /> : <Play size={16} />}
      </button>

      <button onClick={onToggleLog} title={t('toolbar.toggleLog')}>
        <ScrollText size={16} />
      </button>

      {aiEnabled && (
        <button onClick={onAiDraft} title={t('toolbar.aiDraftShortcut')}>
          <Sparkles size={16} />
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

          {/* Page Navigation */}
          {numPages > 0 && (
            <>
              <button
                className="toolbar-compact-btn"
                onClick={handlePrevPage}
                disabled={currentPage <= 1}
                title={t('toolbar.prevPage')}
                aria-label={t('toolbar.prevPage')}
              >
                {'\u25B2'}
              </button>
              <span className="toolbar-page-nav">
                <input
                  className="toolbar-page-input"
                  type="text"
                  inputMode="numeric"
                  value={isPageInputFocused ? pageInputValue : String(currentPage)}
                  onChange={(e) => setPageInputValue(e.target.value.replace(/\D/g, ''))}
                  onFocus={handlePageInputFocus}
                  onBlur={handlePageInputBlur}
                  onKeyDown={handlePageInputKeyDown}
                  title={t('toolbar.goToPage')}
                  aria-label={t('toolbar.goToPage')}
                />
                <span className="toolbar-page-label">
                  {t('toolbar.pageOf')} {numPages}
                </span>
              </span>
              <button
                className="toolbar-compact-btn"
                onClick={handleNextPage}
                disabled={currentPage >= numPages}
                title={t('toolbar.nextPage')}
                aria-label={t('toolbar.nextPage')}
              >
                {'\u25BC'}
              </button>
              <div className="toolbar-separator" />
            </>
          )}

          {/* Zoom Controls */}
          <button
            className="toolbar-compact-btn"
            onClick={() => usePdfStore.getState().zoomOut()}
            disabled={zoomLevel <= ZOOM_MIN}
            title={t('toolbar.zoomOut')}
            aria-label={t('toolbar.zoomOut')}
          >
            -
          </button>
          <PdfZoomDropdown />
          <button
            className="toolbar-compact-btn"
            onClick={() => usePdfStore.getState().zoomIn()}
            disabled={zoomLevel >= ZOOM_MAX}
            title={t('toolbar.zoomIn')}
            aria-label={t('toolbar.zoomIn')}
          >
            +
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

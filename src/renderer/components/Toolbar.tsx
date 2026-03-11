import React, { useState, useCallback } from 'react'
import { Play, Loader, ScrollText, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../store/useEditorStore'
import { useCompileStore } from '../store/useCompileStore'
import { useProjectStore } from '../store/useProjectStore'
import { usePdfStore } from '../store/usePdfStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { OmniSearch } from './OmniSearch'
import PdfZoomDropdown from './PdfZoomDropdown'
import { isFeatureEnabled } from '../utils/featureFlags'

interface ToolbarProps {
  onSave: () => void
  onCompile: () => void
  onToggleLog: () => void
  onOpenFolder: () => void
  onReturnHome: () => void
  onNewFromTemplate: () => void
  onAiDraft: (prefill?: string) => void
  onOpenSettings: () => void
}

function HomeSolidIcon() {
  return (
    <svg className="toolbar-icon-solid" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3.8 4.9 9.4a1.8 1.8 0 0 0-.7 1.4v8.3c0 1 .8 1.8 1.8 1.8h4.1c.4 0 .8-.4.8-.8v-4.2c0-.7.5-1.2 1.2-1.2h.1c.7 0 1.2.5 1.2 1.2v4.2c0 .4.4.8.8.8h4.1c1 0 1.8-.8 1.8-1.8v-8.3c0-.6-.3-1.1-.7-1.4L12 3.8Z" />
    </svg>
  )
}

function SaveSolidIcon() {
  return (
    <svg className="toolbar-icon-solid" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M5.8 3.8h9.4c.5 0 .9.2 1.3.5l3.2 3.2c.3.3.5.8.5 1.3v9.4c0 1.1-.9 2-2 2H5.8c-1.1 0-2-.9-2-2V5.8c0-1.1.9-2 2-2Zm2 0v4.7c0 .5.4.9.9.9h6.6c.5 0 .9-.4.9-.9V3.8h-1.6v3.1c0 .4-.3.7-.7.7h-3.8c-.4 0-.7-.3-.7-.7V3.8H7.8Zm4.2 9.1c-2.1 0-3.9 1.7-3.9 3.9v1.4h7.8v-1.4c0-2.2-1.8-3.9-3.9-3.9Z" />
    </svg>
  )
}

const Toolbar = React.memo(function Toolbar({
  onSave,
  onCompile,
  onToggleLog,
  onOpenFolder,
  onReturnHome,
  onNewFromTemplate,
  onAiDraft,
  onOpenSettings
}: ToolbarProps) {
  const { t } = useTranslation()
  const filePath = useEditorStore((s) => s.filePath)
  const isDirty = useEditorStore((s) => s.isDirty)
  const compileStatus = useCompileStore((s) => s.compileStatus)
  const settings = useSettingsStore((s) => s.settings)
  const aiEnabled = isFeatureEnabled(settings, 'ai')
  const currentPage = usePdfStore((s) => s.currentPage)
  const numPages = usePdfStore((s) => s.numPages)
  const projectRoot = useProjectStore((s) => s.projectRoot)

  const [pageInputValue, setPageInputValue] = useState('')
  const [isPageInputFocused, setIsPageInputFocused] = useState(false)

  const fileName = filePath ? filePath.split(/[\\/]/).pop() : t('toolbar.untitled')

  // Sync Handlers
  const handleSyncToCode = useCallback(() => {
    usePdfStore.getState().triggerSyncToCode()
  }, [])

  const handleSyncToPdf = useCallback(() => {
    const editorState = useEditorStore.getState()
    if (!editorState.filePath) return
    console.log(
      `[SyncTeX UI] forward sync: cursorLine=${editorState.cursorLine}, file=${editorState.filePath}`
    )
    window.api
      .synctexForward(editorState.filePath, editorState.cursorLine)
      .then((result) => {
        console.log('[SyncTeX UI] forward sync result:', result)
        if (result) {
          usePdfStore.getState().setSynctexHighlight(result)
        }
      })
      .catch((err) => {
        console.warn('[SyncTeX UI] forward sync failed:', err)
      })
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

  const handlePageInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      setPageInputValue('')
      setIsPageInputFocused(false)
      e.currentTarget.blur()
    }
  }, [])

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        {projectRoot && (
          <button
            className="toolbar-btn"
            onClick={onReturnHome}
            title={t('toolbar.returnHome')}
            aria-label={t('toolbar.returnHome')}
          >
            <HomeSolidIcon />
          </button>
        )}

        <button
          className={`toolbar-btn${isDirty ? ' save-btn-dirty' : ''}`}
          onClick={onSave}
          title={t('toolbar.quickSave')}
        >
          <SaveSolidIcon />
        </button>

        <button
          className="toolbar-btn compile-btn"
          onClick={onCompile}
          disabled={compileStatus === 'compiling'}
          title={t('toolbar.compileLaTeX')}
        >
          {compileStatus === 'compiling' ? (
            <Loader size={16} className="spin" />
          ) : (
            <Play size={16} />
          )}
        </button>

        {aiEnabled && (
          <button
            className="toolbar-btn"
            onClick={() => onAiDraft()}
            title={t('toolbar.aiDraftShortcut')}
          >
            <Sparkles size={16} />
          </button>
        )}
      </div>

      <div className="toolbar-center">
        <OmniSearch
          onOpenFolder={onOpenFolder}
          onNewFromTemplate={onNewFromTemplate}
          onAiDraft={onAiDraft}
          onOpenSettings={onOpenSettings}
        />
      </div>

      <div className="toolbar-right">
        {settings.showPdfToolbarControls !== false && (
          <div className="toolbar-pdf-controls">
            <button
              className="toolbar-btn toolbar-compact-btn"
              onClick={handleSyncToCode}
              title={t('toolbar.syncPdfToCode')}
              aria-label={t('toolbar.syncPdfToCode')}
            >
              {'\u2190'}
            </button>
            <button
              className="toolbar-btn toolbar-compact-btn"
              onClick={handleSyncToPdf}
              title={t('toolbar.syncCodeToPdf')}
              aria-label={t('toolbar.syncCodeToPdf')}
            >
              {'\u2192'}
            </button>
            <span className="toolbar-separator" />

            {numPages > 0 && (
              <>
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
                <span className="toolbar-separator" />
              </>
            )}

            <PdfZoomDropdown />
          </div>
        )}

        <span className="file-name" title={fileName}>
          {isDirty && <span className="dirty-dot" />}
          {fileName}
        </span>

        <button className="toolbar-btn" onClick={onToggleLog} title={t('toolbar.toggleLog')}>
          <ScrollText size={16} />
        </button>
      </div>
    </div>
  )
})

export default Toolbar

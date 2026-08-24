import React, { useState, useCallback } from 'react'
import {
  Play,
  Loader,
  Sparkles,
  House,
  Save as SaveIcon,
  ArrowLeft,
  ArrowRight
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../store/useEditorStore'
import { useCompileStore } from '../store/useCompileStore'
import { useProjectStore } from '../store/useProjectStore'
import { usePdfStore } from '../store/usePdfStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { OmniSearch } from './OmniSearch'
import { RecentProjectSwitcher } from './RecentProjectSwitcher'
import PdfZoomDropdown from './PdfZoomDropdown'
import { isFeatureEnabled } from '../utils/featureFlags'
import { ICON_SIZE } from './ui/IconSystem'

interface ToolbarProps {
  onSave: () => void
  onCompile: () => void
  onOpenFolder: () => void
  onReturnHome: () => void
  onNewFromTemplate: () => void
  onAiDraft: (prefill?: string) => void
  onAiAssistant: () => void
  onOpenSettings: () => void
}

const Toolbar = React.memo(function Toolbar({
  onSave,
  onCompile,
  onOpenFolder,
  onReturnHome,
  onNewFromTemplate,
  onAiDraft,
  onAiAssistant,
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
    if (import.meta.env.DEV)
      // eslint-disable-next-line no-console
      console.log(
        `[SyncTeX UI] forward sync: cursorLine=${editorState.cursorLine}, file=${editorState.filePath}`
      )
    window.api
      .synctexForward(editorState.filePath, editorState.cursorLine)
      .then((result) => {
        // eslint-disable-next-line no-console
        if (import.meta.env.DEV) console.log('[SyncTeX UI] forward sync result:', result)
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
          <>
            <button
              className="toolbar-btn"
              onClick={onReturnHome}
              title={t('toolbar.returnHome')}
              aria-label={t('toolbar.returnHome')}
            >
              <House size={ICON_SIZE.control} />
            </button>
            <RecentProjectSwitcher />
          </>
        )}

        <button
          className={`toolbar-btn${isDirty ? ' save-btn-dirty' : ''}`}
          onClick={onSave}
          title={t('toolbar.quickSave')}
          aria-label={t('toolbar.quickSave')}
        >
          <SaveIcon size={ICON_SIZE.control} />
        </button>

        <button
          className="toolbar-btn compile-btn"
          onClick={onCompile}
          disabled={compileStatus === 'compiling'}
          title={t('toolbar.compileLaTeX')}
          aria-label={t('toolbar.compileLaTeX')}
        >
          {compileStatus === 'compiling' ? (
            <Loader size={ICON_SIZE.control} className="spin" />
          ) : (
            <Play size={ICON_SIZE.control} />
          )}
        </button>

        {aiEnabled && (
          <button
            className="toolbar-btn"
            data-responsive-priority="secondary"
            onClick={onAiAssistant}
            title={t('toolbar.aiAssistant')}
            aria-label={t('toolbar.aiAssistant')}
          >
            <Sparkles size={ICON_SIZE.control} />
          </button>
        )}
        <div className="toolbar-search-slot">
          <OmniSearch
            onOpenFolder={onOpenFolder}
            onNewFromTemplate={onNewFromTemplate}
            onAiDraft={onAiDraft}
            onOpenSettings={onOpenSettings}
          />
        </div>
      </div>

      <div className="toolbar-center" data-responsive-priority="secondary">
        {settings.showPdfToolbarControls !== false && (
          <div className="toolbar-sync-controls">
            <button
              className="toolbar-btn toolbar-compact-btn"
              onClick={handleSyncToCode}
              title={t('toolbar.syncPdfToCode')}
              aria-label={t('toolbar.syncPdfToCode')}
            >
              <ArrowLeft size={ICON_SIZE.compact} />
            </button>
            <button
              className="toolbar-btn toolbar-compact-btn"
              onClick={handleSyncToPdf}
              title={t('toolbar.syncCodeToPdf')}
              aria-label={t('toolbar.syncCodeToPdf')}
            >
              <ArrowRight size={ICON_SIZE.compact} />
            </button>
          </div>
        )}
      </div>

      <div className="toolbar-right">
        {settings.showPdfToolbarControls !== false && (
          <div className="toolbar-pdf-controls" data-responsive-priority="compact">
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

        <span className="file-name" data-responsive-priority="tertiary" title={fileName}>
          {isDirty && <span className="dirty-dot" />}
          {fileName}
        </span>
      </div>
    </div>
  )
})

export default Toolbar

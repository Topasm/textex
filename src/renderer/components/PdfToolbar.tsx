import React, { useCallback, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../store/useEditorStore'
import { useCompileStore } from '../store/useCompileStore'
import { usePdfStore } from '../store/usePdfStore'
import { useSettingsStore } from '../store/useSettingsStore'
import PdfZoomDropdown from './PdfZoomDropdown'
import { ICON_SIZE } from './ui/IconSystem'
import { proseModeFor, useUiStore } from '../store/useUiStore'
import { logError } from '../utils/errorMessage'

export function PdfToolbar({ children }: { children?: React.ReactNode }) {
  const { t } = useTranslation()
  const filePath = useEditorStore((s) => s.filePath)
  const pdfPath = useCompileStore((s) => s.pdfPath)
  const currentPage = usePdfStore((s) => s.currentPage)
  const numPages = usePdfStore((s) => s.numPages)
  const isProseMode = useUiStore((state) => proseModeFor(state, filePath))
  const pdfControlsEnabled = useSettingsStore((s) => s.settings.showPdfToolbarControls !== false)
  const showPdfControls = pdfControlsEnabled && !isProseMode
  const [pageInputValue, setPageInputValue] = useState('')
  const [isPageInputFocused, setIsPageInputFocused] = useState(false)
  // Sync Handlers
  const handleSyncToCode = useCallback(() => {
    usePdfStore.getState().triggerSyncToCode()
  }, [])

  const handleSyncToPdf = useCallback(() => {
    const editorState = useEditorStore.getState()
    if (!editorState.filePath) return
    const pdfRevision = useCompileStore.getState().pdfRevision
    window.api
      .synctexForward(editorState.filePath, editorState.cursorLine)
      .then((result) => {
        const current = useEditorStore.getState()
        if (
          result &&
          current.filePath === editorState.filePath &&
          current.revision === editorState.revision &&
          current.tabMutationEpoch === editorState.tabMutationEpoch &&
          useCompileStore.getState().pdfRevision === pdfRevision
        ) {
          usePdfStore.getState().setSynctexHighlight(result)
        }
      })
      .catch((error) => logError('SyncTeX:forward', error))
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
    <div className="pdf-toolbar" role="toolbar" aria-label="PDF">
      <span className="pdf-toolbar-title">PDF</span>
      {showPdfControls && (
        <div className="toolbar-sync-controls">
          <button
            className="toolbar-btn toolbar-compact-btn"
            onClick={handleSyncToCode}
            disabled={!pdfPath}
            title={t('toolbar.syncPdfToCode')}
            aria-label={t('toolbar.syncPdfToCode')}
          >
            <ArrowLeft size={ICON_SIZE.compact} />
          </button>
          <button
            className="toolbar-btn toolbar-compact-btn"
            onClick={handleSyncToPdf}
            disabled={!filePath}
            title={t('toolbar.syncCodeToPdf')}
            aria-label={t('toolbar.syncCodeToPdf')}
          >
            <ArrowRight size={ICON_SIZE.compact} />
          </button>
        </div>
      )}
      {showPdfControls && (
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
      <div className="pdf-toolbar-search">{children}</div>
    </div>
  )
}

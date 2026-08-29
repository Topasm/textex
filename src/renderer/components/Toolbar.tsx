import React, { useState, useCallback } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  House,
  Loader,
  Menu,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightOpen,
  Pilcrow,
  Play,
  Save as SaveIcon,
  Square,
  X
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { WindowResizeDirection } from '../types/api'
import { useEditorStore } from '../store/useEditorStore'
import { useCompileStore } from '../store/useCompileStore'
import { useProjectStore } from '../store/useProjectStore'
import { usePdfStore } from '../store/usePdfStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { proseViewFor, useUiStore } from '../store/useUiStore'
import { OmniSearch } from './OmniSearch'
import { RecentProjectSwitcher } from './RecentProjectSwitcher'
import PdfZoomDropdown from './PdfZoomDropdown'
import { ICON_SIZE } from './ui/IconSystem'
import { withShortcutHint } from '../services/commandSearch'
import { toggleProjectSidebar, toggleProseMode, toggleProsePreview } from '../services/appCommands'
import { logError } from '../utils/errorMessage'
import type { AppCommandId } from '../../shared/types'

interface ToolbarProps {
  onSave: () => void
  onCompile: () => void
  onOpenFolder: () => void
  onReturnHome: () => void
  onNewFromTemplate: () => void
  onAiDraft: (prefill?: string) => void
  onRunCommand: (command: AppCommandId) => void
  onOpenCommandPalette: () => void
  onOpenSettings: () => void
}

const TOOLBAR_NO_DRAG_SELECTOR = [
  'button',
  'input',
  'select',
  'a',
  '[role="menu"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '.menu-dropdown',
  '.toolbar-pdf-controls',
  '.omni-search-wrapper',
  '[data-no-drag]'
].join(', ')

const WINDOW_RESIZE_HANDLES = [
  ['north', 'North'],
  ['south', 'South'],
  ['west', 'West'],
  ['east', 'East'],
  ['north-west', 'NorthWest'],
  ['north-east', 'NorthEast'],
  ['south-west', 'SouthWest'],
  ['south-east', 'SouthEast']
] as const satisfies ReadonlyArray<readonly [string, WindowResizeDirection]>

function usesCustomWindowChrome(): boolean {
  return document.documentElement.dataset.platform !== 'darwin'
}

function isNoDragTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(TOOLBAR_NO_DRAG_SELECTOR) !== null
}

function WindowResizeHandles() {
  return (
    <div className="window-resize-handles" aria-hidden="true" data-no-drag>
      {WINDOW_RESIZE_HANDLES.map(([name, direction]) => (
        <div
          key={direction}
          className={`window-resize-handle window-resize-handle-${name}`}
          data-no-drag
          onMouseDown={(event) => {
            if (event.button !== 0) return
            event.preventDefault()
            event.stopPropagation()
            void window.api.startWindowResize(direction).catch(() => undefined)
          }}
        />
      ))}
    </div>
  )
}

const Toolbar = React.memo(function Toolbar({
  onSave,
  onCompile,
  onOpenFolder,
  onReturnHome,
  onNewFromTemplate,
  onAiDraft,
  onRunCommand,
  onOpenCommandPalette,
  onOpenSettings
}: ToolbarProps) {
  const { t } = useTranslation()
  const filePath = useEditorStore((s) => s.filePath)
  const isDirty = useEditorStore((s) => s.isDirty)
  const compileStatus = useCompileStore((s) => s.compileStatus)
  const pdfPath = useCompileStore((s) => s.pdfPath)
  const settings = useSettingsStore((s) => s.settings)
  const currentPage = usePdfStore((s) => s.currentPage)
  const numPages = usePdfStore((s) => s.numPages)
  const projectRoot = useProjectStore((s) => s.projectRoot)
  const isSidebarOpen = useProjectStore((s) => s.isSidebarOpen)
  const isResearchPanelOpen = useProjectStore((s) => s.isResearchPanelOpen)
  const isProseEditor = useUiStore((state) => proseViewFor(state, filePath).editor === 'prose')
  const isProsePreview = useUiStore((state) => proseViewFor(state, filePath).preview === 'prose')
  const canUseProseMode = Boolean(filePath?.toLowerCase().endsWith('.tex'))

  const [pageInputValue, setPageInputValue] = useState('')
  const [isPageInputFocused, setIsPageInputFocused] = useState(false)
  const customWindowChrome = usesCustomWindowChrome()

  const fileName = filePath ? filePath.split(/[\\/]/).pop() : t('toolbar.untitled')

  // Sync Handlers
  const handleSyncToCode = useCallback(() => {
    usePdfStore.getState().triggerSyncToCode()
  }, [])

  const handleSyncToPdf = useCallback(() => {
    const editorState = useEditorStore.getState()
    if (!editorState.filePath) return
    window.api
      .synctexForward(editorState.filePath, editorState.cursorLine)
      .then((result) => {
        if (result) {
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

  const handleToolbarMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0 || isNoDragTarget(event.target)) return

      event.preventDefault()
      if (customWindowChrome && event.detail === 2) {
        void window.api.toggleMaximizeWindow().catch(() => undefined)
        return
      }
      void window.api.startWindowDragging().catch(() => undefined)
    },
    [customWindowChrome]
  )

  return (
    <>
      {customWindowChrome && <WindowResizeHandles />}
      <div
        className="toolbar"
        data-custom-window-chrome={customWindowChrome ? 'true' : 'false'}
        onMouseDown={handleToolbarMouseDown}
      >
        <div className="toolbar-left">
          {customWindowChrome && (
            <button
              type="button"
              className="toolbar-btn toolbar-app-menu"
              onClick={onOpenCommandPalette}
              title={withShortcutHint(t('toolbar.appMenu'), 'commandPalette.open')}
              aria-label={t('toolbar.appMenu')}
              data-no-drag
            >
              <Menu size={ICON_SIZE.control} />
            </button>
          )}
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
              <button
                type="button"
                className={`toolbar-btn toolbar-sidebar-toggle${isSidebarOpen && !settings.autoHideSidebar ? ' active' : ''}`}
                onClick={toggleProjectSidebar}
                title={withShortcutHint(
                  t('commandPalette.commands.view_toggleSidebar'),
                  'view.toggleSidebar'
                )}
                aria-label={t('commandPalette.commands.view_toggleSidebar')}
                aria-controls="project-sidebar"
                aria-expanded={isSidebarOpen && !settings.autoHideSidebar}
              >
                {isSidebarOpen && !settings.autoHideSidebar ? (
                  <PanelLeftClose size={ICON_SIZE.control} />
                ) : (
                  <PanelLeftOpen size={ICON_SIZE.control} />
                )}
              </button>
            </>
          )}

          <button
            className={`toolbar-btn${isDirty ? ' save-btn-dirty' : ''}`}
            onClick={onSave}
            disabled={!filePath}
            title={withShortcutHint(t('toolbar.quickSave'), 'file.save')}
            aria-label={t('toolbar.quickSave')}
          >
            <SaveIcon size={ICON_SIZE.control} />
          </button>

          <button
            className="toolbar-btn compile-btn"
            onClick={onCompile}
            disabled={!filePath || compileStatus === 'compiling'}
            title={withShortcutHint(t('toolbar.compileLaTeX'), 'compile.run')}
            aria-label={t('toolbar.compileLaTeX')}
          >
            {compileStatus === 'compiling' ? (
              <Loader size={ICON_SIZE.control} className="spin" />
            ) : (
              <Play size={ICON_SIZE.control} />
            )}
          </button>

          {/* One button per half of the workspace. They are independent, so
              the author can draft in Markdown with the PDF still in view. */}
          <button
            type="button"
            className={`toolbar-btn toolbar-prose-toggle${isProseEditor ? ' active' : ''}`}
            onClick={toggleProseMode}
            disabled={!canUseProseMode}
            title={withShortcutHint(
              t(isProseEditor ? 'prosePane.showTex' : 'prosePane.showProse'),
              'view.toggleProse'
            )}
            aria-label={t(isProseEditor ? 'prosePane.showTex' : 'prosePane.showProse')}
            aria-pressed={isProseEditor}
          >
            <Pilcrow size={ICON_SIZE.control} />
          </button>

          <button
            type="button"
            className={`toolbar-btn toolbar-prose-preview-toggle${isProsePreview ? ' active' : ''}`}
            onClick={toggleProsePreview}
            disabled={!canUseProseMode}
            title={withShortcutHint(
              t(isProsePreview ? 'prosePane.showPdf' : 'prosePane.showRendering'),
              'view.toggleProsePreview'
            )}
            aria-label={t(isProsePreview ? 'prosePane.showPdf' : 'prosePane.showRendering')}
            aria-pressed={isProsePreview}
          >
            <BookOpen size={ICON_SIZE.control} />
          </button>

          <div className="toolbar-search-slot">
            <OmniSearch
              onOpenFolder={onOpenFolder}
              onNewFromTemplate={onNewFromTemplate}
              onAiDraft={onAiDraft}
              onOpenSettings={onOpenSettings}
              onRunCommand={onRunCommand}
            />
          </div>
        </div>

        <div className="toolbar-center" data-responsive-priority="secondary">
          {settings.showPdfToolbarControls !== false && (
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
          {projectRoot && !isResearchPanelOpen && (
            <button
              type="button"
              className="toolbar-btn toolbar-research-toggle"
              onClick={() => useProjectStore.getState().openResearchPanel('references')}
              title={withShortcutHint(t('researchPanel.open'), 'view.toggleResearchPanel')}
              aria-label={t('researchPanel.open')}
              aria-controls="research-panel"
              aria-expanded="false"
              id="research-panel-toggle"
            >
              <PanelRightOpen size={ICON_SIZE.control} />
            </button>
          )}
          {customWindowChrome && (
            <div
              className="toolbar-window-controls"
              role="group"
              aria-label={t('toolbar.windowControls')}
              data-no-drag
            >
              <button
                type="button"
                className="toolbar-window-control toolbar-window-minimize"
                onClick={() => void window.api.minimizeWindow().catch(() => undefined)}
                title={t('toolbar.minimizeWindow')}
                aria-label={t('toolbar.minimizeWindow')}
                data-no-drag
              >
                <Minus size={ICON_SIZE.compact} />
              </button>
              <button
                type="button"
                className="toolbar-window-control toolbar-window-maximize"
                onClick={() => void window.api.toggleMaximizeWindow().catch(() => undefined)}
                title={t('toolbar.toggleMaximizeWindow')}
                aria-label={t('toolbar.toggleMaximizeWindow')}
                data-no-drag
              >
                <Square size={ICON_SIZE.compact} />
              </button>
              <button
                type="button"
                className="toolbar-window-control toolbar-window-close"
                onClick={() => void window.api.requestWindowClose().catch(() => undefined)}
                title={t('toolbar.closeWindow')}
                aria-label={t('toolbar.closeWindow')}
                data-no-drag
              >
                <X size={ICON_SIZE.compact} />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
})

export default Toolbar

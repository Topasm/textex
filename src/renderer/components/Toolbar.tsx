import React, { useCallback, useRef } from 'react'
import {
  House,
  FolderOpen,
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
import { useSettingsStore } from '../store/useSettingsStore'
import { proseModeFor, useUiStore } from '../store/useUiStore'
import { RecentProjectSwitcher } from './RecentProjectSwitcher'
import { ICON_SIZE } from './ui/IconSystem'
import { withShortcutHint } from '../services/commandSearch'
import { toggleProjectSidebar, toggleProseMode, toggleResearchPanel } from '../services/appCommands'

interface ToolbarProps {
  onSave: () => void
  onCompile: () => void
  onOpenFolder: () => void
  onReturnHome: () => void
  onOpenCommandPalette: (mode?: 'commands' | 'files') => void
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
  '[data-no-drag]'
].join(', ')

/** Dedupe window for one physical double-click arriving on two event paths. */
const DOUBLE_CLICK_TOGGLE_GUARD_MS = 250

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
  onReturnHome,
  onOpenCommandPalette
}: ToolbarProps) {
  const { t } = useTranslation()
  const filePath = useEditorStore((s) => s.filePath)
  const isDirty = useEditorStore((s) => s.isDirty)
  const compileStatus = useCompileStore((s) => s.compileStatus)
  const settings = useSettingsStore((s) => s.settings)
  const projectRoot = useProjectStore((s) => s.projectRoot)
  const isSidebarOpen = useProjectStore((s) => s.isSidebarOpen)
  const isResearchPanelOpen = useProjectStore((s) => s.isResearchPanelOpen)
  const isProseMode = useUiStore((state) => proseModeFor(state, filePath))
  const canUseProseMode = Boolean(filePath?.toLowerCase().endsWith('.tex'))

  const customWindowChrome = usesCustomWindowChrome()

  const fileName = filePath ? filePath.split(/[\\/]/).pop() : t('toolbar.untitled')

  /**
   * Double-clicking structural toolbar space maximizes or restores the window
   * on every platform. macOS hides its title bar behind the overlay chrome, so
   * without this the system's own double-click-to-zoom never applies here.
   *
   * A native drag session can swallow either the second mousedown or the
   * synthesized dblclick, so both events request the toggle and this guard
   * keeps one physical double-click from toggling twice.
   */
  const lastMaximizeToggleAt = useRef(0)
  const toggleWindowMaximize = useCallback(() => {
    const now = Date.now()
    if (now - lastMaximizeToggleAt.current < DOUBLE_CLICK_TOGGLE_GUARD_MS) return
    lastMaximizeToggleAt.current = now
    void window.api.toggleMaximizeWindow().catch(() => undefined)
  }, [])

  const handleToolbarMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0 || isNoDragTarget(event.target)) return

      event.preventDefault()
      if (event.detail === 2) {
        toggleWindowMaximize()
        return
      }
      void window.api.startWindowDragging().catch(() => undefined)
    },
    [toggleWindowMaximize]
  )

  const handleToolbarDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0 || isNoDragTarget(event.target)) return
      toggleWindowMaximize()
    },
    [toggleWindowMaximize]
  )

  return (
    <>
      {customWindowChrome && <WindowResizeHandles />}
      <div
        className="toolbar"
        data-custom-window-chrome={customWindowChrome ? 'true' : 'false'}
        onMouseDown={handleToolbarMouseDown}
        onDoubleClick={handleToolbarDoubleClick}
      >
        <div className="toolbar-left">
          <button
            type="button"
            className="toolbar-btn toolbar-app-menu"
            onClick={() => onOpenCommandPalette()}
            title={withShortcutHint(t('toolbar.appMenu'), 'commandPalette.open')}
            aria-label={t('toolbar.appMenu')}
            data-no-drag
          >
            <Menu size={ICON_SIZE.control} />
          </button>
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

          <button
            type="button"
            className={`toolbar-btn toolbar-prose-toggle${isProseMode ? ' active' : ''}`}
            onClick={toggleProseMode}
            disabled={!canUseProseMode}
            title={`${withShortcutHint(
              t(isProseMode ? 'prosePane.showTex' : 'prosePane.showProse'),
              'view.toggleProse'
            )}\n${t('prosePane.swipeHint')}`}
            aria-label={t(isProseMode ? 'prosePane.showTex' : 'prosePane.showProse')}
            aria-pressed={isProseMode}
          >
            <Pilcrow size={ICON_SIZE.control} />
          </button>

          {projectRoot && (
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => onOpenCommandPalette('files')}
              title={withShortcutHint(t('localSearch.files'), 'files.open')}
              aria-label={t('localSearch.files')}
            >
              <FolderOpen size={ICON_SIZE.control} />
            </button>
          )}
        </div>

        <div className="toolbar-center" data-responsive-priority="secondary"></div>

        <div className="toolbar-right">
          <span className="file-name" data-responsive-priority="tertiary" title={fileName}>
            {isDirty && <span className="dirty-dot" />}
            {fileName}
          </span>
          {projectRoot && !isResearchPanelOpen && (
            <button
              type="button"
              className="toolbar-btn toolbar-research-toggle"
              onClick={() => toggleResearchPanel('chat')}
              title={withShortcutHint(t('researchPanel.open'), 'view.toggleResearchPanel')}
              aria-label={t('researchPanel.open')}
              aria-controls="research-panel"
              aria-expanded="false"
              id="research-panel-toggle"
            >
              <PanelRightOpen size={ICON_SIZE.control} />
              <span>{t('researchPanel.label')}</span>
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

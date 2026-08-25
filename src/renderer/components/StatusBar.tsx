import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleX, GitBranch, TriangleAlert } from 'lucide-react'
import { useCompileStore } from '../store/useCompileStore'
import { useEditorStore } from '../store/useEditorStore'
import { useProjectStore } from '../store/useProjectStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { useUiStore } from '../store/useUiStore'
import { isFeatureEnabled } from '../utils/featureFlags'
import { getDesktopCapabilities } from '../platform/capabilities'
import { toggleLogPanel } from '../services/appCommands'
import { ICON_SIZE } from './ui/IconSystem'

const StatusBar = React.memo(function StatusBar() {
  const { t } = useTranslation()
  const compileStatus = useCompileStore((s) => s.compileStatus)
  const cursorLine = useEditorStore((s) => s.cursorLine)
  const cursorColumn = useEditorStore((s) => s.cursorColumn)
  const diagnostics = useCompileStore((s) => s.diagnostics)
  const isGitRepo = useProjectStore((s) => s.isGitRepo)
  const gitBranch = useProjectStore((s) => s.gitBranch)
  const settings = useSettingsStore((s) => s.settings)
  const capabilities = getDesktopCapabilities()
  const spellCheckEnabled = isFeatureEnabled(settings, 'spellcheck')
  const sectionHighlightEnabled = useSettingsStore((s) => s.settings.sectionHighlightEnabled)
  const lspStatus = useUiStore((s) => s.lspStatus)
  const lspEnabled = isFeatureEnabled(settings, 'lsp')

  const STATUS_CONFIG = {
    idle: { dotClass: 'green', label: t('statusBar.ready') },
    compiling: { dotClass: 'yellow', label: t('statusBar.compiling') },
    success: { dotClass: 'green', label: t('statusBar.success') },
    error: { dotClass: 'red', label: t('statusBar.error') }
  } as const

  const { dotClass, label } = STATUS_CONFIG[compileStatus]

  const errorCount = useMemo(
    () => diagnostics.filter((d) => d.severity === 'error').length,
    [diagnostics]
  )
  const warnCount = useMemo(
    () => diagnostics.filter((d) => d.severity === 'warning').length,
    [diagnostics]
  )

  return (
    <div className="status-bar">
      <div className="status-left">
        <button
          type="button"
          className="status-action status-compile-indicator"
          data-responsive-priority="primary"
          onClick={toggleLogPanel}
          title={t('statusBar.toggleLog')}
        >
          <span className={`status-dot ${dotClass}`} />
          <span>{label}</span>
          {(errorCount > 0 || warnCount > 0) && (
            <span className="status-diagnostics">
              {errorCount > 0 && (
                <span className="status-errors">
                  <CircleX size={ICON_SIZE.micro} />
                  {errorCount}
                </span>
              )}
              {warnCount > 0 && (
                <span className="status-warnings">
                  <TriangleAlert size={ICON_SIZE.micro} />
                  {warnCount}
                </span>
              )}
            </span>
          )}
        </button>
        {isGitRepo && gitBranch && (
          <span
            className="status-git-branch"
            data-responsive-priority="tertiary"
            title={t('statusBar.gitBranch', { branch: gitBranch })}
          >
            <GitBranch size={ICON_SIZE.micro} />
            {gitBranch}
          </span>
        )}
      </div>
      <div className="status-right">
        {lspEnabled && (
          <span
            className={`status-lsp${lspStatus === 'error' ? ' status-lsp-error' : ''}`}
            data-responsive-priority="secondary"
            title={
              lspStatus === 'error'
                ? t('statusBar.lspErrorTitle')
                : t('statusBar.lspTitle', { status: lspStatus })
            }
          >
            {t('statusBar.lsp')}:{' '}
            {lspStatus === 'running'
              ? t('statusBar.lspConnected')
              : lspStatus === 'starting'
                ? t('statusBar.lspStarting')
                : lspStatus === 'error'
                  ? t('statusBar.lspError')
                  : t('statusBar.lspOff')}
          </span>
        )}
        <button
          type="button"
          className="status-action status-spellcheck"
          data-responsive-priority="secondary"
          onClick={() =>
            useSettingsStore
              .getState()
              .updateSetting('sectionHighlightEnabled', !sectionHighlightEnabled)
          }
          title={t('statusBar.toggleSectionHighlight')}
        >
          {t('statusBar.sections')}:{' '}
          {sectionHighlightEnabled ? t('statusBar.on') : t('statusBar.off')}
        </button>
        {capabilities.spellcheck && (
          <button
            type="button"
            className="status-action status-spellcheck"
            data-responsive-priority="secondary"
            onClick={() =>
              useSettingsStore.getState().updateSetting('spellCheckEnabled', !spellCheckEnabled)
            }
            title={t('statusBar.toggleSpellCheck')}
          >
            {t('statusBar.spell')}: {spellCheckEnabled ? t('statusBar.on') : t('statusBar.off')}
          </button>
        )}
        <span className="status-cursor" data-responsive-priority="primary">
          {t('statusBar.ln')} {cursorLine}, {t('statusBar.col')} {cursorColumn}
        </span>
      </div>
    </div>
  )
})

export default StatusBar

import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/useAppStore'

const StatusBar = React.memo(function StatusBar() {
  const { t } = useTranslation()
  const compileStatus = useAppStore((s) => s.compileStatus)
  const cursorLine = useAppStore((s) => s.cursorLine)
  const cursorColumn = useAppStore((s) => s.cursorColumn)
  const diagnostics = useAppStore((s) => s.diagnostics)
  const isGitRepo = useAppStore((s) => s.isGitRepo)
  const gitBranch = useAppStore((s) => s.gitBranch)
  const spellCheckEnabled = useAppStore((s) => s.settings.spellCheckEnabled)
  const sectionHighlightEnabled = useAppStore((s) => s.settings.sectionHighlightEnabled)
  const lspStatus = useAppStore((s) => s.lspStatus)
  const lspEnabled = useAppStore((s) => s.settings.lspEnabled)

  const toggleLogPanel = useAppStore((s) => s.toggleLogPanel)

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
        <span
          className="status-compile-indicator"
          onClick={toggleLogPanel}
          role="button"
          tabIndex={0}
          title={t('statusBar.toggleLog')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              toggleLogPanel()
            }
          }}
        >
          <span className={`status-dot ${dotClass}`} />
          <span>{label}</span>
          {(errorCount > 0 || warnCount > 0) && (
            <span className="status-diagnostics">
              {errorCount > 0 && (
                <span className="status-errors">
                  {'\u2716'} {errorCount}
                </span>
              )}
              {warnCount > 0 && (
                <span className="status-warnings">
                  {'\u26A0'} {warnCount}
                </span>
              )}
            </span>
          )}
        </span>
        {isGitRepo && gitBranch && (
          <span className="status-git-branch" title={t('statusBar.gitBranch', { branch: gitBranch })}>
            {'\u2387'} {gitBranch}
          </span>
        )}
      </div>
      <div className="status-right">
        {lspEnabled && (
          <span
            className={`status-lsp${lspStatus === 'error' ? ' status-lsp-error' : ''}`}
            title={lspStatus === 'error' ? t('statusBar.lspErrorTitle') : t('statusBar.lspTitle', { status: lspStatus })}
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
        <span
          className="status-spellcheck"
          onClick={() =>
            useAppStore
              .getState()
              .updateSetting('sectionHighlightEnabled', !sectionHighlightEnabled)
          }
          title={t('statusBar.toggleSectionHighlight')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              useAppStore
                .getState()
                .updateSetting('sectionHighlightEnabled', !sectionHighlightEnabled)
            }
          }}
        >
          {t('statusBar.sections')}: {sectionHighlightEnabled ? t('statusBar.on') : t('statusBar.off')}
        </span>
        <span
          className="status-spellcheck"
          onClick={() =>
            useAppStore.getState().updateSetting('spellCheckEnabled', !spellCheckEnabled)
          }
          title={t('statusBar.toggleSpellCheck')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              useAppStore.getState().updateSetting('spellCheckEnabled', !spellCheckEnabled)
            }
          }}
        >
          {t('statusBar.spell')}: {spellCheckEnabled ? t('statusBar.on') : t('statusBar.off')}
        </span>
        <span>
          {t('statusBar.ln')} {cursorLine}, {t('statusBar.col')} {cursorColumn}
        </span>
      </div>
    </div>
  )
})

export default StatusBar

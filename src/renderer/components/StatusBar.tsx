import { useAppStore } from '../store/useAppStore'

const STATUS_CONFIG = {
  idle: { dotClass: 'green', label: 'Ready' },
  compiling: { dotClass: 'yellow', label: 'Compiling...' },
  success: { dotClass: 'green', label: 'Success' },
  error: { dotClass: 'red', label: 'Error' }
} as const

function StatusBar() {
  const compileStatus = useAppStore((s) => s.compileStatus)
  const cursorLine = useAppStore((s) => s.cursorLine)
  const cursorColumn = useAppStore((s) => s.cursorColumn)
  const diagnostics = useAppStore((s) => s.diagnostics)
  const isGitRepo = useAppStore((s) => s.isGitRepo)
  const gitBranch = useAppStore((s) => s.gitBranch)
  const spellCheckEnabled = useAppStore((s) => s.spellCheckEnabled)
  const lspStatus = useAppStore((s) => s.lspStatus)
  const lspEnabled = useAppStore((s) => s.lspEnabled)

  const { dotClass, label } = STATUS_CONFIG[compileStatus]

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length
  const warnCount = diagnostics.filter((d) => d.severity === 'warning').length

  return (
    <div className="status-bar">
      <div className="status-left">
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
        {isGitRepo && gitBranch && (
          <span className="status-git-branch" title={`Git branch: ${gitBranch}`}>
            {'\u2387'} {gitBranch}
          </span>
        )}
      </div>
      <div className="status-right">
        {lspEnabled && (
          <span
            className={`status-lsp${lspStatus === 'error' ? ' status-lsp-error' : ''}`}
            title={lspStatus === 'error' ? 'TexLab LSP error' : `TexLab LSP: ${lspStatus}`}
          >
            LSP:{' '}
            {lspStatus === 'running'
              ? 'Connected'
              : lspStatus === 'starting'
                ? 'Starting...'
                : lspStatus === 'error'
                  ? 'Error'
                  : 'Off'}
          </span>
        )}
        <span
          className="status-spellcheck"
          onClick={() => useAppStore.getState().setSpellCheckEnabled(!spellCheckEnabled)}
          title="Toggle spell check"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              useAppStore.getState().setSpellCheckEnabled(!spellCheckEnabled)
            }
          }}
        >
          Spell: {spellCheckEnabled ? 'On' : 'Off'}
        </span>
        <span>
          Ln {cursorLine}, Col {cursorColumn}
        </span>
      </div>
    </div>
  )
}

export default StatusBar

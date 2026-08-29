import { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Minus, Plus, RefreshCw, Upload } from 'lucide-react'
import { useProjectStore } from '../store/useProjectStore'
import { getGitFileDecoration } from '../utils/gitStatus'
import { errorMessage, logError } from '../utils/errorMessage'
import type { GitRemoteStatus } from '../types/api'
import { ICON_SIZE } from './ui/IconSystem'

type RemoteAction = 'fetch' | 'pull' | 'push'

function GitPanel() {
  const { t } = useTranslation()
  const projectRoot = useProjectStore((s) => s.projectRoot)
  const isRepo = useProjectStore((s) => s.isGitRepo)
  const gitStatus = useProjectStore((s) => s.gitStatus)
  const [commitMsg, setCommitMsg] = useState('')
  const [remoteStatus, setRemoteStatus] = useState<GitRemoteStatus | null>(null)
  const [remoteAction, setRemoteAction] = useState<RemoteAction | 'refresh' | null>(null)
  const [remoteNotice, setRemoteNotice] = useState('')
  const [remoteError, setRemoteError] = useState('')
  const remoteGeneration = useRef(0)

  const refreshRemote = useCallback(async () => {
    if (!projectRoot || !isRepo) return
    const generation = ++remoteGeneration.current
    setRemoteAction('refresh')
    setRemoteError('')
    try {
      const next = await window.api.gitRemoteStatus(projectRoot)
      if (
        generation === remoteGeneration.current &&
        useProjectStore.getState().projectRoot === projectRoot
      ) {
        setRemoteStatus(next)
      }
    } catch (error) {
      if (
        generation === remoteGeneration.current &&
        useProjectStore.getState().projectRoot === projectRoot
      ) {
        setRemoteError(errorMessage(error))
      }
    } finally {
      if (
        generation === remoteGeneration.current &&
        useProjectStore.getState().projectRoot === projectRoot
      ) {
        setRemoteAction(null)
      }
    }
  }, [isRepo, projectRoot])

  useEffect(() => {
    setRemoteStatus(null)
    setRemoteNotice('')
    setRemoteError('')
    if (projectRoot && isRepo) void refreshRemote()
    return () => {
      remoteGeneration.current += 1
    }
  }, [isRepo, projectRoot, refreshRemote])

  const refreshLocalStatus = useCallback(async (expectedRoot: string) => {
    const status = await window.api.gitStatus(expectedRoot)
    if (useProjectStore.getState().projectRoot !== expectedRoot) return
    useProjectStore.getState().setGitStatus(status)
    useProjectStore.getState().setGitBranch(status.branch)
  }, [])

  const handleInit = useCallback(async () => {
    if (!projectRoot) return
    try {
      await window.api.gitInit(projectRoot)
      useProjectStore.getState().setIsGitRepo(true)
      await refreshLocalStatus(projectRoot)
      await refreshRemote()
    } catch (err) {
      logError('GitPanel:init', err)
    }
  }, [projectRoot, refreshLocalStatus, refreshRemote])

  const handleStage = useCallback(
    async (filePath: string) => {
      if (!projectRoot) return
      try {
        await window.api.gitStage(projectRoot, filePath)
        await refreshLocalStatus(projectRoot)
      } catch (err) {
        logError('GitPanel:stage', err)
      }
    },
    [projectRoot, refreshLocalStatus]
  )

  const handleUnstage = useCallback(
    async (filePath: string) => {
      if (!projectRoot) return
      try {
        await window.api.gitUnstage(projectRoot, filePath)
        await refreshLocalStatus(projectRoot)
      } catch (err) {
        logError('GitPanel:unstage', err)
      }
    },
    [projectRoot, refreshLocalStatus]
  )

  const handleCommit = useCallback(async () => {
    if (!projectRoot || !commitMsg.trim()) return
    try {
      await window.api.gitCommit(projectRoot, commitMsg.trim())
      setCommitMsg('')
      await refreshLocalStatus(projectRoot)
      await refreshRemote()
    } catch (err) {
      logError('GitPanel:commit', err)
    }
  }, [projectRoot, commitMsg, refreshLocalStatus, refreshRemote])

  const runRemoteAction = useCallback(
    async (action: RemoteAction) => {
      if (!projectRoot || remoteAction) return
      if (action === 'pull') {
        const confirmed = window.confirm(
          t('gitPanel.pullConfirm', {
            upstream: remoteStatus?.upstream ?? '',
            behind: remoteStatus?.behind ?? 0
          })
        )
        if (!confirmed) return
      }
      if (action === 'push') {
        const confirmed = window.confirm(
          t('gitPanel.pushConfirm', {
            upstream: remoteStatus?.upstream ?? '',
            ahead: remoteStatus?.ahead ?? 0
          })
        )
        if (!confirmed) return
      }

      const generation = ++remoteGeneration.current
      setRemoteAction(action)
      setRemoteNotice('')
      setRemoteError('')
      try {
        const next = await {
          fetch: window.api.gitFetch,
          pull: window.api.gitPull,
          push: window.api.gitPush
        }[action](projectRoot)
        if (
          generation !== remoteGeneration.current ||
          useProjectStore.getState().projectRoot !== projectRoot
        ) {
          return
        }
        setRemoteStatus(next)
        await refreshLocalStatus(projectRoot)
        if (
          generation === remoteGeneration.current &&
          useProjectStore.getState().projectRoot === projectRoot
        ) {
          setRemoteNotice(t(`gitPanel.${action}Complete`))
        }
      } catch (error) {
        if (
          generation === remoteGeneration.current &&
          useProjectStore.getState().projectRoot === projectRoot
        ) {
          setRemoteError(errorMessage(error))
          logError(`GitPanel:${action}`, error)
        }
      } finally {
        if (
          generation === remoteGeneration.current &&
          useProjectStore.getState().projectRoot === projectRoot
        ) {
          setRemoteAction(null)
        }
      }
    },
    [projectRoot, refreshLocalStatus, remoteAction, remoteStatus, t]
  )

  if (!projectRoot) {
    return (
      <div className="git-panel">
        <div className="panel-empty">{t('gitPanel.openFolder')}</div>
      </div>
    )
  }

  if (!isRepo) {
    return (
      <div className="git-panel">
        <div className="panel-empty">
          {t('gitPanel.notRepo')}
          <br />
          <button
            className="git-commit-btn"
            style={{ width: 'auto', marginTop: '8px', padding: '4px 12px' }}
            onClick={handleInit}
          >
            {t('gitPanel.initRepo')}
          </button>
        </div>
      </div>
    )
  }

  const staged = gitStatus?.staged || []
  const unstaged = [...(gitStatus?.modified || []), ...(gitStatus?.not_added || [])]
  const worktreeDirty = staged.length > 0 || unstaged.length > 0
  const hasRemote = Boolean(remoteStatus?.remote)
  const hasUpstream = Boolean(remoteStatus?.upstream)

  return (
    <div className="git-panel">
      <div className="git-remote-section">
        <div className="git-remote-header">
          <div className="git-remote-summary">
            <span className="git-remote-name">
              {remoteStatus?.upstream ?? remoteStatus?.remote ?? t('gitPanel.noRemote')}
            </span>
            {hasUpstream && (
              <span className="git-divergence">
                {t('gitPanel.divergence', {
                  ahead: remoteStatus?.ahead ?? 0,
                  behind: remoteStatus?.behind ?? 0
                })}
              </span>
            )}
          </div>
          <button
            className="git-remote-icon-btn"
            onClick={() => void refreshRemote()}
            disabled={Boolean(remoteAction)}
            title={t('gitPanel.refreshRemote')}
            aria-label={t('gitPanel.refreshRemote')}
          >
            <RefreshCw
              size={ICON_SIZE.compact}
              className={remoteAction === 'refresh' ? 'git-action-spinning' : undefined}
            />
          </button>
        </div>
        {hasRemote && !hasUpstream && <p className="git-remote-hint">{t('gitPanel.noUpstream')}</p>}
        <div className="git-remote-actions">
          <button
            type="button"
            onClick={() => void runRemoteAction('fetch')}
            disabled={Boolean(remoteAction) || !hasRemote}
          >
            <Download size={ICON_SIZE.compact} />
            {t('gitPanel.fetch')}
          </button>
          <button
            type="button"
            onClick={() => void runRemoteAction('pull')}
            disabled={Boolean(remoteAction) || !hasUpstream || worktreeDirty}
            title={worktreeDirty ? t('gitPanel.pullDirty') : undefined}
          >
            <Download size={ICON_SIZE.compact} />
            {t('gitPanel.pull')}
          </button>
          <button
            type="button"
            onClick={() => void runRemoteAction('push')}
            disabled={Boolean(remoteAction) || !hasUpstream}
          >
            <Upload size={ICON_SIZE.compact} />
            {t('gitPanel.push')}
          </button>
        </div>
        {(remoteNotice || remoteError) && (
          <div
            className={remoteError ? 'git-remote-message error' : 'git-remote-message'}
            role="status"
          >
            {remoteError || remoteNotice}
          </div>
        )}
      </div>
      {staged.length > 0 && (
        <div className="git-section">
          <div className="git-section-header">
            <span>{t('gitPanel.stagedChanges')}</span>
            <span>{staged.length}</span>
          </div>
          {staged.map((fp) => {
            const st = getGitFileDecoration(fp, gitStatus?.files, 'exact') || {
              className: '',
              label: 'M'
            }
            return (
              <div key={fp} className="git-file">
                <span className={`git-file-status ${st.className}`}>{st.label}</span>
                <span className="git-file-name">{fp}</span>
                <button
                  className="git-file-action"
                  onClick={() => handleUnstage(fp)}
                  title={t('gitPanel.unstage')}
                  aria-label={t('gitPanel.unstage')}
                >
                  <Minus size={ICON_SIZE.compact} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {unstaged.length > 0 && (
        <div className="git-section">
          <div className="git-section-header">
            <span>{t('gitPanel.changes')}</span>
            <span>{unstaged.length}</span>
          </div>
          {unstaged.map((fp) => {
            const st = getGitFileDecoration(fp, gitStatus?.files, 'exact') || {
              className: '',
              label: 'M'
            }
            return (
              <div key={fp} className="git-file">
                <span className={`git-file-status ${st.className}`}>{st.label}</span>
                <span className="git-file-name">{fp}</span>
                <button
                  className="git-file-action"
                  onClick={() => handleStage(fp)}
                  title={t('gitPanel.stage')}
                  aria-label={t('gitPanel.stage')}
                >
                  <Plus size={ICON_SIZE.compact} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {staged.length === 0 && unstaged.length === 0 && (
        <div className="panel-empty">{t('gitPanel.noChanges')}</div>
      )}

      <div className="git-commit-section">
        <textarea
          className="git-commit-input"
          placeholder={t('gitPanel.commitMessage')}
          rows={3}
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault()
              handleCommit()
            }
          }}
        />
        <button
          className="git-commit-btn"
          onClick={handleCommit}
          disabled={!commitMsg.trim() || staged.length === 0}
        >
          {t('gitPanel.commit', { count: staged.length })}
        </button>
      </div>
    </div>
  )
}

export default GitPanel

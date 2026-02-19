import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../store/useProjectStore'
import { getGitFileDecoration } from '../utils/gitStatus'
import { logError } from '../utils/errorMessage'

function GitPanel() {
  const { t } = useTranslation()
  const projectRoot = useProjectStore((s) => s.projectRoot)
  const isRepo = useProjectStore((s) => s.isGitRepo)
  const gitStatus = useProjectStore((s) => s.gitStatus)
  const [commitMsg, setCommitMsg] = useState('')

  const handleInit = useCallback(async () => {
    if (!projectRoot) return
    try {
      await window.api.gitInit(projectRoot)
      useProjectStore.getState().setIsGitRepo(true)
      const status = await window.api.gitStatus(projectRoot)
      useProjectStore.getState().setGitStatus(status)
      useProjectStore.getState().setGitBranch(status.branch)
    } catch (err) {
      logError('GitPanel:init', err)
    }
  }, [projectRoot])

  const handleStage = useCallback(
    async (filePath: string) => {
      if (!projectRoot) return
      try {
        await window.api.gitStage(projectRoot, filePath)
        const status = await window.api.gitStatus(projectRoot)
        useProjectStore.getState().setGitStatus(status)
      } catch (err) {
        logError('GitPanel:stage', err)
      }
    },
    [projectRoot]
  )

  const handleUnstage = useCallback(
    async (filePath: string) => {
      if (!projectRoot) return
      try {
        await window.api.gitUnstage(projectRoot, filePath)
        const status = await window.api.gitStatus(projectRoot)
        useProjectStore.getState().setGitStatus(status)
      } catch (err) {
        logError('GitPanel:unstage', err)
      }
    },
    [projectRoot]
  )

  const handleCommit = useCallback(async () => {
    if (!projectRoot || !commitMsg.trim()) return
    try {
      await window.api.gitCommit(projectRoot, commitMsg.trim())
      setCommitMsg('')
      const status = await window.api.gitStatus(projectRoot)
      useProjectStore.getState().setGitStatus(status)
    } catch (err) {
      logError('GitPanel:commit', err)
    }
  }, [projectRoot, commitMsg])

  if (!projectRoot) {
    return (
      <div className="git-panel">
        <div className="git-empty">{t('gitPanel.openFolder')}</div>
      </div>
    )
  }

  if (!isRepo) {
    return (
      <div className="git-panel">
        <div className="git-empty">
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

  return (
    <div className="git-panel">
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
                  {'\u2212'}
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
                  +
                </button>
              </div>
            )
          })}
        </div>
      )}

      {staged.length === 0 && unstaged.length === 0 && <div className="git-empty">{t('gitPanel.noChanges')}</div>}

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

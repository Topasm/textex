import { useState, useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'

function GitPanel() {
  const projectRoot = useAppStore((s) => s.projectRoot)
  const isRepo = useAppStore((s) => s.isGitRepo)
  const gitStatus = useAppStore((s) => s.gitStatus)
  const [commitMsg, setCommitMsg] = useState('')

  const handleInit = useCallback(async () => {
    if (!projectRoot) return
    try {
      await window.api.gitInit(projectRoot)
      useAppStore.getState().setIsGitRepo(true)
      const status = await window.api.gitStatus(projectRoot)
      useAppStore.getState().setGitStatus(status)
      useAppStore.getState().setGitBranch(status.branch)
    } catch {
      // ignore
    }
  }, [projectRoot])

  const handleStage = useCallback(async (filePath: string) => {
    if (!projectRoot) return
    try {
      await window.api.gitStage(projectRoot, filePath)
      const status = await window.api.gitStatus(projectRoot)
      useAppStore.getState().setGitStatus(status)
    } catch {
      // ignore
    }
  }, [projectRoot])

  const handleUnstage = useCallback(async (filePath: string) => {
    if (!projectRoot) return
    try {
      await window.api.gitUnstage(projectRoot, filePath)
      const status = await window.api.gitStatus(projectRoot)
      useAppStore.getState().setGitStatus(status)
    } catch {
      // ignore
    }
  }, [projectRoot])

  const handleCommit = useCallback(async () => {
    if (!projectRoot || !commitMsg.trim()) return
    try {
      await window.api.gitCommit(projectRoot, commitMsg.trim())
      setCommitMsg('')
      const status = await window.api.gitStatus(projectRoot)
      useAppStore.getState().setGitStatus(status)
    } catch {
      // ignore
    }
  }, [projectRoot, commitMsg])

  if (!projectRoot) {
    return (
      <div className="git-panel">
        <div className="git-empty">Open a folder to use Git features.</div>
      </div>
    )
  }

  if (!isRepo) {
    return (
      <div className="git-panel">
        <div className="git-empty">
          Not a Git repository.
          <br />
          <button className="git-commit-btn" style={{ width: 'auto', marginTop: '8px', padding: '4px 12px' }} onClick={handleInit}>
            Initialize Repository
          </button>
        </div>
      </div>
    )
  }

  const staged = gitStatus?.staged || []
  const unstaged = [
    ...(gitStatus?.modified || []),
    ...(gitStatus?.not_added || [])
  ]

  function getFileStatus(filePath: string): { cls: string; label: string } {
    const file = gitStatus?.files.find((f) => f.path === filePath)
    if (!file) return { cls: '', label: 'M' }
    if (file.index === '?' && file.working_dir === '?') return { cls: 'untracked', label: 'U' }
    if (file.index === 'A' || file.working_dir === 'A') return { cls: 'added', label: 'A' }
    if (file.index === 'D' || file.working_dir === 'D') return { cls: 'deleted', label: 'D' }
    return { cls: 'modified', label: 'M' }
  }

  return (
    <div className="git-panel">
      {staged.length > 0 && (
        <div className="git-section">
          <div className="git-section-header">
            <span>Staged Changes</span>
            <span>{staged.length}</span>
          </div>
          {staged.map((fp) => {
            const st = getFileStatus(fp)
            return (
              <div key={fp} className="git-file">
                <span className={`git-file-status ${st.cls}`}>{st.label}</span>
                <span className="git-file-name">{fp}</span>
                <button className="git-file-action" onClick={() => handleUnstage(fp)} title="Unstage">
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
            <span>Changes</span>
            <span>{unstaged.length}</span>
          </div>
          {unstaged.map((fp) => {
            const st = getFileStatus(fp)
            return (
              <div key={fp} className="git-file">
                <span className={`git-file-status ${st.cls}`}>{st.label}</span>
                <span className="git-file-name">{fp}</span>
                <button className="git-file-action" onClick={() => handleStage(fp)} title="Stage">
                  +
                </button>
              </div>
            )
          })}
        </div>
      )}

      {staged.length === 0 && unstaged.length === 0 && (
        <div className="git-empty">No changes</div>
      )}

      <div className="git-commit-section">
        <textarea
          className="git-commit-input"
          placeholder="Commit message"
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
          Commit ({staged.length} staged)
        </button>
      </div>
    </div>
  )
}

export default GitPanel

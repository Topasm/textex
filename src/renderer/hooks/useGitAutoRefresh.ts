import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import { GIT_REFRESH_INTERVAL_MS } from '../constants'
import { logError } from '../utils/errorMessage'

/**
 * Polls git status periodically while a git repo is open and git is enabled.
 */
export function useGitAutoRefresh(projectRoot: string | null, isGitRepo: boolean, gitEnabled?: boolean): void {
  useEffect(() => {
    if (!projectRoot || !isGitRepo || gitEnabled === false) return
    const interval = setInterval(async () => {
      try {
        const status = await window.api.gitStatus(projectRoot)
        const s = useAppStore.getState()
        s.setGitStatus(status)
        s.setGitBranch(status.branch)
      } catch (err) {
        logError('gitAutoRefresh', err)
      }
    }, GIT_REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [projectRoot, isGitRepo, gitEnabled])
}

import { useEffect } from 'react'
import { useProjectStore } from '../store/useProjectStore'
import { GIT_REFRESH_INTERVAL_MS } from '../constants'
import { logError } from '../utils/errorMessage'

/**
 * Polls git status periodically while a git repo is open and git is enabled.
 */
export function useGitAutoRefresh(
  projectRoot: string | null,
  isGitRepo: boolean,
  gitEnabled?: boolean
): void {
  useEffect(() => {
    if (!projectRoot || !isGitRepo || gitEnabled === false) return
    let active = true
    const interval = setInterval(async () => {
      try {
        const status = await window.api.gitStatus(projectRoot)
        if (!active || useProjectStore.getState().projectRoot !== projectRoot) return
        const s = useProjectStore.getState()
        s.setGitStatus(status)
        s.setGitBranch(status.branch)
      } catch (err) {
        logError('gitAutoRefresh', err)
      }
    }, GIT_REFRESH_INTERVAL_MS)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [projectRoot, isGitRepo, gitEnabled])
}

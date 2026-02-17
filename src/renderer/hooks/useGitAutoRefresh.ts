import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'

/**
 * Polls git status every 3 seconds while a git repo is open and git is enabled.
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
      } catch {
        // ignore
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [projectRoot, isGitRepo, gitEnabled])
}

import { useEffect } from 'react'
import { useProjectStore } from '../store/useProjectStore'

/**
 * Automatically loads bib entries and citation groups when projectRoot changes.
 */
export function useBibAutoLoad(projectRoot: string | null): void {
  useEffect(() => {
    if (!projectRoot) return
    let active = true
    const canPublish = (): boolean =>
      active && useProjectStore.getState().projectRoot === projectRoot
    window.api
      .findBibInProject(projectRoot)
      .then((entries) => {
        if (canPublish()) useProjectStore.getState().setBibEntries(entries)
      })
      .catch(() => {})
    window.api
      .loadCitationGroups(projectRoot)
      .then((groups) => {
        if (canPublish()) useProjectStore.getState().setCitationGroups(groups)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [projectRoot])
}

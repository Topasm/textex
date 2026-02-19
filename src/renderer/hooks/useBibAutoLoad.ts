import { useEffect } from 'react'
import { useProjectStore } from '../store/useProjectStore'

/**
 * Automatically loads bib entries and citation groups when projectRoot changes.
 */
export function useBibAutoLoad(projectRoot: string | null): void {
  useEffect(() => {
    if (!projectRoot) return
    window.api
      .findBibInProject(projectRoot)
      .then((entries) => {
        useProjectStore.getState().setBibEntries(entries)
      })
      .catch(() => {})
    // Also load citation groups
    window.api
      .loadCitationGroups(projectRoot)
      .then((groups) => {
        useProjectStore.getState().setCitationGroups(groups)
      })
      .catch(() => {})
  }, [projectRoot])
}

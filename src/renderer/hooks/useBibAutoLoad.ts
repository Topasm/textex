import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'

/**
 * Automatically loads bib entries and citation groups when projectRoot changes.
 */
export function useBibAutoLoad(projectRoot: string | null): void {
  useEffect(() => {
    if (!projectRoot) return
    window.api
      .findBibInProject(projectRoot)
      .then((entries) => {
        useAppStore.getState().setBibEntries(entries)
      })
      .catch(() => { })
    // Also load citation groups
    window.api
      .loadCitationGroups(projectRoot)
      .then((groups) => {
        useAppStore.getState().setCitationGroups(groups)
      })
      .catch(() => { })
  }, [projectRoot])
}

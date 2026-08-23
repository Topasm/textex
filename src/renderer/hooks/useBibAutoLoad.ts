import { useEffect } from 'react'
import { useProjectStore } from '../store/useProjectStore'
import { getDesktopCapabilities } from '../platform/capabilities'

/**
 * Automatically loads bib entries and citation groups when projectRoot changes.
 */
export function useBibAutoLoad(projectRoot: string | null): void {
  const citationGroupsSupported = getDesktopCapabilities().citationGroups
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
    if (citationGroupsSupported) {
      window.api
        .loadCitationGroups(projectRoot)
        .then((groups) => {
          if (canPublish()) useProjectStore.getState().setCitationGroups(groups)
        })
        .catch(() => {})
    } else {
      useProjectStore.getState().setCitationGroups([])
    }
    return () => {
      active = false
    }
  }, [citationGroupsSupported, projectRoot])
}

import { useProjectStore } from '../store/useProjectStore'
import { useSettingsStore } from '../store/useSettingsStore'

let researchOpenGeneration = 0

function projectFilePath(projectRoot: string, fileName: string): string {
  const separator = projectRoot.includes('\\') ? '\\' : '/'
  return `${projectRoot.replace(/[\\/]$/, '')}${separator}${fileName}`
}

/** Invalidates an in-flight sync before a project transition publishes its next root. */
export function invalidateResearchProjectOpenSync(): void {
  researchOpenGeneration += 1
}

/**
 * Runs the optional Zotero collection sync once for one published project-open
 * lifecycle. The generation and root checks prevent an older async result from
 * refreshing bibliography state after a project transition (including A-B-A).
 */
export async function syncResearchOnProjectOpen(projectRoot: string): Promise<void> {
  const generation = ++researchOpenGeneration
  const isCurrent = (): boolean =>
    generation === researchOpenGeneration && useProjectStore.getState().projectRoot === projectRoot

  const config = await window.api.researchLoadConfig()
  if (!isCurrent() || !config.syncOnOpen || !config.zoteroCollection || !config.zoteroFile) {
    return
  }

  const port = useSettingsStore.getState().settings.zoteroPort
  await window.api.zoteroSyncCollection(
    config.zoteroCollection,
    projectFilePath(projectRoot, config.zoteroFile),
    port
  )
  if (!isCurrent()) return

  const entries = await window.api.findBibInProject(projectRoot)
  if (!isCurrent()) return
  const project = useProjectStore.getState()
  project.setBibEntries(entries)
  project.invalidateDirectory(projectRoot)
}

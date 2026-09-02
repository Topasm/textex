import i18n from '../i18n'
import { useNotificationStore } from '../store/useNotificationStore'
import { useProjectStore } from '../store/useProjectStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { describeNativeError } from './nativeErrors'

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
 * Whether it runs at all is the `zoteroSyncMode` user setting; the project file
 * only names the collection.
 */
export async function syncResearchOnProjectOpen(projectRoot: string): Promise<void> {
  const generation = ++researchOpenGeneration
  const isCurrent = (): boolean =>
    generation === researchOpenGeneration && useProjectStore.getState().projectRoot === projectRoot

  try {
    await runResearchOpenSync(projectRoot, isCurrent)
  } catch (error) {
    // The sync is optional, but silently dropping its failure made an
    // unreachable Zotero look like a forgotten project setting.
    if (!isCurrent()) return
    useNotificationStore.getState().pushNotification({
      id: 'research-open-sync:failed',
      tone: 'warning',
      message: i18n.t('notifications.researchSyncOnOpenFailed', {
        error: describeNativeError(error)
      })
    })
  }
}

async function runResearchOpenSync(projectRoot: string, isCurrent: () => boolean): Promise<void> {
  const settings = useSettingsStore.getState().settings
  if ((settings.zoteroSyncMode ?? 'continuous') === 'off') return

  const config = await window.api.researchLoadConfig()
  if (!isCurrent() || !config.zoteroCollection || !config.zoteroFile) {
    return
  }

  const port = settings.zoteroPort
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

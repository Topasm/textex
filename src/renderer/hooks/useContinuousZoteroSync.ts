import { useEffect, useRef } from 'react'
import i18n from '../i18n'
import { describeNativeError } from '../services/nativeErrors'
import { watchZoteroCollection } from '../services/zoteroCollectionWatcher'
import { invalidateZoteroInventory } from '../services/zoteroInventoryCache'
import { invalidateZoteroItemDetails } from '../services/zoteroItemDetailCache'
import { useNotificationStore } from '../store/useNotificationStore'
import { useProjectStore } from '../store/useProjectStore'
import { useSettingsStore } from '../store/useSettingsStore'
import { useZoteroSyncStore } from '../store/useZoteroSyncStore'

function projectFilePath(projectRoot: string, fileName: string): string {
  const separator = projectRoot.includes('\\') ? '\\' : '/'
  return `${projectRoot.replace(/[\\/]$/, '')}${separator}${fileName}`
}

/** Keeps the configured managed bibliography current for the whole project lifetime. */
export function useContinuousZoteroSync(): void {
  const projectRoot = useProjectStore((state) => state.projectRoot)
  const port = useSettingsStore((state) => state.settings.zoteroPort)
  const syncMode = useSettingsStore((state) => state.settings.zoteroSyncMode ?? 'continuous')
  const configurationRevision = useZoteroSyncStore((state) => state.configurationRevision)
  const lastConfigurationRevision = useRef(configurationRevision)
  const lastSyncMode = useRef(syncMode)

  useEffect(() => {
    const syncNewConfiguration = configurationRevision !== lastConfigurationRevision.current
    const syncJustEnabled = syncMode === 'continuous' && lastSyncMode.current !== 'continuous'
    lastConfigurationRevision.current = configurationRevision
    lastSyncMode.current = syncMode
    if (!projectRoot || syncMode !== 'continuous') return

    const root = projectRoot
    let active = true
    let stopWatching: (() => void) | undefined
    const isCurrent = (): boolean =>
      active &&
      useProjectStore.getState().projectRoot === root &&
      useSettingsStore.getState().settings.zoteroPort === port &&
      (useSettingsStore.getState().settings.zoteroSyncMode ?? 'continuous') === 'continuous'

    const synchronize = async (collection: string, zoteroFile: string): Promise<void> => {
      await window.api.zoteroSyncCollection(collection, projectFilePath(root, zoteroFile), port)
      if (!isCurrent()) return
      const entries = await window.api.findBibInProject(root)
      if (!isCurrent()) return
      const project = useProjectStore.getState()
      project.setBibEntries(entries)
      project.invalidateDirectory(root)
      invalidateZoteroInventory(port)
      invalidateZoteroItemDetails()
      useZoteroSyncStore.getState().markDataChanged()
      useNotificationStore.getState().dismissNotification('zotero-continuous-sync:failed')
    }

    void window.api
      .researchLoadConfig()
      .then(async (config) => {
        if (!isCurrent() || !config.zoteroCollection || !config.zoteroFile) return
        if (syncNewConfiguration || syncJustEnabled) {
          await synchronize(config.zoteroCollection, config.zoteroFile)
          if (!isCurrent()) return
        }
        stopWatching = watchZoteroCollection({
          collectionKey: config.zoteroCollection,
          port,
          onChange: () => synchronize(config.zoteroCollection!, config.zoteroFile),
          onError: (error) => {
            if (!isCurrent()) return
            useNotificationStore.getState().pushNotification({
              id: 'zotero-continuous-sync:failed',
              tone: 'warning',
              message: i18n.t('notifications.researchContinuousSyncFailed', {
                error: describeNativeError(error)
              })
            })
          }
        })
      })
      .catch((error) => {
        if (!isCurrent()) return
        useNotificationStore.getState().pushNotification({
          id: 'zotero-continuous-sync:failed',
          tone: 'warning',
          message: i18n.t('notifications.researchContinuousSyncFailed', {
            error: describeNativeError(error)
          })
        })
      })

    return () => {
      active = false
      stopWatching?.()
    }
  }, [configurationRevision, port, projectRoot, syncMode])
}

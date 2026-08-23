import React from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../store/useSettingsStore'
import { Link, RefreshCw } from 'lucide-react'
import { Toggle } from './Toggle'
import { useProjectStore } from '../../store/useProjectStore'

const ZoteroStatusProbe = ({ port }: { port: number }) => {
  const { t } = useTranslation()
  const [status, setStatus] = React.useState<'checking' | 'connected' | 'error'>('checking')

  React.useEffect(() => {
    let mounted = true
    const check = async () => {
      setStatus('checking')
      try {
        const connected = await window.api.zoteroProbe(port)
        if (mounted) setStatus(connected ? 'connected' : 'error')
      } catch {
        if (mounted) setStatus('error')
      }
    }
    check()
    const interval = setInterval(check, 5000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [port])

  if (status === 'checking')
    return <span className="settings-status-text">{t('settings.integrations.checking')}</span>
  if (status === 'connected')
    return (
      <span className="settings-status-text connected settings-status-inline">
        <span className="settings-status-dot connected" />
        {t('settings.integrations.connected')}
      </span>
    )
  return (
    <span className="settings-status-text error settings-status-inline">
      <span className="settings-status-dot error" />
      {t('settings.integrations.disconnected')}
    </span>
  )
}

export const IntegrationsTab = () => {
  const { t } = useTranslation()
  const settings = useSettingsStore((state) => state.settings)
  const updateSetting = useSettingsStore((state) => state.updateSetting)
  const projectRoot = useProjectStore((state) => state.projectRoot)
  const setBibEntries = useProjectStore((state) => state.setBibEntries)
  const invalidateDirectory = useProjectStore((state) => state.invalidateDirectory)
  const [syncStatus, setSyncStatus] = React.useState<
    | { state: 'idle' | 'syncing' }
    | { state: 'success'; count: number }
    | { state: 'error'; message: string }
  >({ state: 'idle' })

  const syncCollection = async () => {
    if (!projectRoot || !settings.zoteroCollection.trim()) return
    setSyncStatus({ state: 'syncing' })
    try {
      const result = await window.api.zoteroSyncCollection(
        settings.zoteroCollection.trim(),
        undefined,
        settings.zoteroPort
      )
      const entries = await window.api.parseBibFile(result.filePath)
      setBibEntries(entries)
      invalidateDirectory(projectRoot)
      setSyncStatus({ state: 'success', count: result.entryCount })
    } catch (error) {
      setSyncStatus({
        state: 'error',
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }

  return (
    <div className="settings-tab-content settings-animate-in">
      <div className="settings-section">
        <div className="settings-section-header">
          <div className="settings-section-icon">
            <Link size={24} />
          </div>
          <div className="settings-section-body">
            <div className="settings-flex-row">
              <h3 className="settings-section-title settings-no-mb">
                {t('settings.integrations.zotero')}
              </h3>
              <Toggle
                checked={settings.zoteroEnabled}
                onChange={(checked) => updateSetting('zoteroEnabled', checked)}
              />
            </div>
            <p className="settings-section-description">{t('settings.integrations.zoteroDesc')}</p>

            {settings.zoteroEnabled && (
              <>
                <div className="settings-inline-row">
                  <div className="settings-inline-label">
                    <label className="settings-label settings-no-mb">
                      {t('settings.integrations.portNumber')}
                    </label>
                    <input
                      type="number"
                      value={settings.zoteroPort}
                      onChange={(e) => updateSetting('zoteroPort', parseInt(e.target.value))}
                      className="settings-input-small"
                    />
                  </div>
                  <div className="settings-status-badge">
                    <span className="settings-status-label">
                      {t('settings.integrations.status')}
                    </span>
                    <ZoteroStatusProbe port={settings.zoteroPort} />
                  </div>
                </div>
                <div style={{ marginTop: 14 }}>
                  <label className="settings-label" htmlFor="zotero-collection">
                    {t('settings.integrations.collectionPath')}
                  </label>
                  <div className="settings-flex-row">
                    <input
                      id="zotero-collection"
                      type="text"
                      value={settings.zoteroCollection}
                      onChange={(event) => updateSetting('zoteroCollection', event.target.value)}
                      placeholder="/0/8CV58ZVD"
                      className="settings-input"
                    />
                    <button
                      type="button"
                      className="primary-button settings-nowrap"
                      onClick={syncCollection}
                      disabled={
                        !projectRoot ||
                        !settings.zoteroCollection.trim() ||
                        syncStatus.state === 'syncing'
                      }
                    >
                      <RefreshCw size={14} aria-hidden="true" />
                      {syncStatus.state === 'syncing'
                        ? t('settings.integrations.syncing')
                        : t('settings.integrations.syncCollection')}
                    </button>
                  </div>
                  <p className="settings-section-description" aria-live="polite">
                    {!projectRoot
                      ? t('settings.integrations.openProjectToSync')
                      : syncStatus.state === 'success'
                        ? t('settings.integrations.syncSuccess', { count: syncStatus.count })
                        : syncStatus.state === 'error'
                          ? t('settings.integrations.syncError', { error: syncStatus.message })
                          : t('settings.integrations.collectionPathDesc')}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <hr className="settings-divider" />

      <div className="settings-section">
        <div className="settings-section-header">
          <div className="settings-section-icon">
            <Link size={24} />
          </div>
          <div className="settings-section-body">
            <div className="settings-flex-row">
              <h3 className="settings-section-title settings-no-mb">
                {t('settings.integrations.gitIntegration')}
              </h3>
              <Toggle
                checked={settings.gitEnabled !== false}
                onChange={(checked) => updateSetting('gitEnabled', checked)}
              />
            </div>
            <p className="settings-section-description">{t('settings.integrations.gitDesc')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

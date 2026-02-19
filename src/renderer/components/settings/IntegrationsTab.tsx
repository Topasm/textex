import React from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../store/useSettingsStore'
import { Link } from 'lucide-react'
import { Toggle } from './Toggle'

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

  if (status === 'checking') return <span className="settings-status-text">{t('settings.integrations.checking')}</span>
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

  return (
    <div className="settings-tab-content settings-animate-in">
      <div className="settings-section">
        <div className="settings-section-header">
          <div className="settings-section-icon">
            <Link size={24} />
          </div>
          <div className="settings-section-body">
            <div className="settings-flex-row">
              <h3 className="settings-section-title settings-no-mb">{t('settings.integrations.zotero')}</h3>
              <Toggle
                checked={settings.zoteroEnabled}
                onChange={(checked) => updateSetting('zoteroEnabled', checked)}
              />
            </div>
            <p className="settings-section-description">
              {t('settings.integrations.zoteroDesc')}
            </p>

            {settings.zoteroEnabled && (
              <div className="settings-inline-row">
                <div className="settings-inline-label">
                  <label className="settings-label settings-no-mb">{t('settings.integrations.portNumber')}</label>
                  <input
                    type="number"
                    value={settings.zoteroPort}
                    onChange={(e) => updateSetting('zoteroPort', parseInt(e.target.value))}
                    className="settings-input-small"
                  />
                </div>
                <div className="settings-status-badge">
                  <span className="settings-status-label">{t('settings.integrations.status')}</span>
                  <ZoteroStatusProbe port={settings.zoteroPort} />
                </div>
              </div>
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
              <h3 className="settings-section-title settings-no-mb">{t('settings.integrations.gitIntegration')}</h3>
              <Toggle
                checked={settings.gitEnabled !== false}
                onChange={(checked) => updateSetting('gitEnabled', checked)}
              />
            </div>
            <p className="settings-section-description">
              {t('settings.integrations.gitDesc')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

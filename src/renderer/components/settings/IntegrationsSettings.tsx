import React from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../store/useSettingsStore'
import { Toggle } from './Toggle'
import { SettingsRow, SettingsSection, SettingsSelect, SettingsToggleRow } from './SettingsControls'

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

const ZOTERO_OPTION_KEYS = [
  'portNumber',
  'status',
  'syncMode',
  'syncModeDesc',
  'syncModeContinuous',
  'syncModeOpen',
  'syncModeOff',
  'citeOnlineToZotero',
  'citeOnlineToZoteroHint'
] as const

export const IntegrationsSettings = () => {
  const { t } = useTranslation()
  const settings = useSettingsStore((state) => state.settings)
  const updateSetting = useSettingsStore((state) => state.updateSetting)
  const syncModeOptions = [
    t('settings.integrations.syncModeContinuous'),
    t('settings.integrations.syncModeOpen'),
    t('settings.integrations.syncModeOff')
  ]

  return (
    <>
      <SettingsSection
        title={t('settings.integrations.zotero')}
        description={t('settings.integrations.zoteroDesc')}
        keywords={ZOTERO_OPTION_KEYS.map((key) => t(`settings.integrations.${key}`))}
        action={
          <Toggle
            aria-label={t('settings.integrations.zotero')}
            checked={settings.zoteroEnabled}
            onChange={(checked) => updateSetting('zoteroEnabled', checked)}
          />
        }
      >
        {settings.zoteroEnabled && (
          <>
            <SettingsRow label={t('settings.integrations.portNumber')} htmlFor="zotero-port">
              <input
                id="zotero-port"
                type="number"
                value={settings.zoteroPort}
                onChange={(event) => updateSetting('zoteroPort', parseInt(event.target.value))}
                className="settings-input-small"
              />
            </SettingsRow>

            <SettingsRow label={t('settings.integrations.status')}>
              <ZoteroStatusProbe port={settings.zoteroPort} />
            </SettingsRow>

            <SettingsRow
              label={t('settings.integrations.syncMode')}
              description={t('settings.integrations.syncModeDesc')}
              keywords={syncModeOptions}
              htmlFor="zotero-sync-mode"
            >
              <SettingsSelect
                id="zotero-sync-mode"
                width="wide"
                value={settings.zoteroSyncMode ?? 'continuous'}
                onChange={(event) =>
                  updateSetting(
                    'zoteroSyncMode',
                    event.target.value as NonNullable<typeof settings.zoteroSyncMode>
                  )
                }
              >
                <option value="continuous">{t('settings.integrations.syncModeContinuous')}</option>
                <option value="open">{t('settings.integrations.syncModeOpen')}</option>
                <option value="off">{t('settings.integrations.syncModeOff')}</option>
              </SettingsSelect>
            </SettingsRow>

            <SettingsToggleRow
              label={t('settings.integrations.citeOnlineToZotero')}
              description={t('settings.integrations.citeOnlineToZoteroHint')}
              checked={settings.citeOnlineToZotero}
              onChange={(checked) => updateSetting('citeOnlineToZotero', checked)}
            />
          </>
        )}
      </SettingsSection>

      <SettingsSection
        title={t('settings.integrations.gitIntegration')}
        description={t('settings.integrations.gitDesc')}
        action={
          <Toggle
            aria-label={t('settings.integrations.gitIntegration')}
            checked={settings.gitEnabled !== false}
            onChange={(checked) => updateSetting('gitEnabled', checked)}
          />
        }
      />
    </>
  )
}

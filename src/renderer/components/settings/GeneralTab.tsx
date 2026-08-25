import React from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../store/useSettingsStore'
import { Toggle } from './Toggle'
import { SUPPORTED_LANGUAGES } from '../../i18n'
import { checkForAppUpdate } from '../../services/updateLifecycle'

export const GeneralTab = () => {
  const { t } = useTranslation()
  const settings = useSettingsStore((state) => state.settings)
  const updateSetting = useSettingsStore((state) => state.updateSetting)

  return (
    <div className="settings-tab-content settings-animate-in">
      <div>
        <h3 className="settings-heading" style={{ marginBottom: 12 }}>
          {t('settings.general.application')}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="settings-row">
            <div>
              <div className="settings-row-label">{t('settings.general.autoUpdates')}</div>
              <div className="settings-row-description">
                {t('settings.general.autoUpdatesDesc')}
              </div>
            </div>
            <Toggle
              checked={settings.autoUpdateEnabled !== false}
              onChange={(checked) => updateSetting('autoUpdateEnabled', checked)}
            />
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-row-label">{t('settings.general.checkUpdatesNow')}</div>
              <div className="settings-row-description">
                {t('settings.general.checkUpdatesNowDesc')}
              </div>
            </div>
            <button
              type="button"
              className="primary-button settings-nowrap"
              onClick={() => void checkForAppUpdate({ interactive: true })}
            >
              {t('settings.general.checkNow')}
            </button>
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-row-label">{t('settings.general.language')}</div>
              <div className="settings-row-description">{t('settings.general.languageDesc')}</div>
            </div>
            <select
              value={settings.language || 'en'}
              onChange={(e) => updateSetting('language', e.target.value)}
              className="settings-select settings-select-narrow"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}

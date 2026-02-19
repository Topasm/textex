import React from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store/useAppStore'
import { User } from 'lucide-react'
import { Toggle } from './Toggle'
import { SUPPORTED_LANGUAGES } from '../../i18n'

export const GeneralTab = () => {
  const { t } = useTranslation()
  const settings = useAppStore((state) => state.settings)
  const updateSetting = useAppStore((state) => state.updateSetting)

  return (
    <div className="settings-tab-content settings-animate-in">
      <div className="settings-section">
        <div className="settings-section-header">
          <div className="settings-section-icon">
            <User size={24} />
          </div>
          <div className="settings-section-body">
            <h3 className="settings-section-title">{t('settings.general.userInfo')}</h3>
            <p className="settings-section-description">
              {t('settings.general.userInfoDesc')}
            </p>

            <div className="settings-field-group">
              <div>
                <label className="settings-label">{t('settings.general.fullName')}</label>
                <input
                  type="text"
                  value={settings.name}
                  onChange={(e) => updateSetting('name', e.target.value)}
                  placeholder={t('settings.general.fullNamePlaceholder')}
                  className="settings-input"
                />
              </div>
              <div>
                <label className="settings-label">{t('settings.general.email')}</label>
                <input
                  type="email"
                  value={settings.email}
                  onChange={(e) => updateSetting('email', e.target.value)}
                  placeholder={t('settings.general.emailPlaceholder')}
                  className="settings-input"
                />
              </div>
              <div>
                <label className="settings-label">{t('settings.general.affiliation')}</label>
                <input
                  type="text"
                  value={settings.affiliation}
                  onChange={(e) => updateSetting('affiliation', e.target.value)}
                  placeholder={t('settings.general.affiliationPlaceholder')}
                  className="settings-input"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <hr className="settings-divider" />

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
              <div className="settings-row-label">{t('settings.general.language')}</div>
              <div className="settings-row-description">
                {t('settings.general.languageDesc')}
              </div>
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

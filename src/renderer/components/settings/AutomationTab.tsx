import React from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../store/useSettingsStore'
import { Toggle } from './Toggle'

export const AutomationTab = () => {
  const { t } = useTranslation()
  const settings = useSettingsStore((state) => state.settings)
  const updateSetting = useSettingsStore((state) => state.updateSetting)

  return (
    <div className="settings-tab-content settings-animate-in">
      <div>
        <h3 className="settings-heading settings-heading-mb">
          {t('settings.automation.compilerTools')}
        </h3>
        <div className="settings-column-group">
          <div className="settings-row">
            <div>
              <div className="settings-row-label">{t('settings.automation.autoCompile')}</div>
              <div className="settings-row-description">
                {t('settings.automation.autoCompileDesc')}
              </div>
            </div>
            <Toggle
              checked={settings.autoCompile}
              onChange={(checked) => updateSetting('autoCompile', checked)}
            />
          </div>
          <div className="settings-row">
            <div>
              <div className="settings-row-label">{t('settings.automation.spellCheck')}</div>
              <div className="settings-row-description">
                {t('settings.automation.spellCheckDesc')}
              </div>
            </div>
            <Toggle
              checked={settings.spellCheckEnabled}
              onChange={(checked) => updateSetting('spellCheckEnabled', checked)}
            />
          </div>
          {settings.spellCheckEnabled && (
            <div className="settings-spellcheck-sub">
              <label className="settings-label">{t('settings.automation.spellLanguage')}</label>
              <select
                value={settings.spellCheckLanguage ?? 'en-US'}
                onChange={(e) => {
                  updateSetting('spellCheckLanguage', e.target.value)
                  window.api.spellSetLanguage(e.target.value)
                }}
                className="settings-select settings-select-medium"
              >
                <option value="en-US">English (US)</option>
              </select>
            </div>
          )}
          <div className="settings-row">
            <div>
              <div className="settings-row-label">{t('settings.automation.languageServer')}</div>
              <div className="settings-row-description">
                {t('settings.automation.languageServerDesc')}
              </div>
            </div>
            <Toggle
              checked={settings.lspEnabled}
              onChange={(checked) => updateSetting('lspEnabled', checked)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

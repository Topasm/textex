import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES } from '../../i18n'
import { checkForAppUpdate } from '../../services/updateLifecycle'
import { useSettingsStore } from '../../store/useSettingsStore'
import { SettingsRow, SettingsSection, SettingsSelect, SettingsToggleRow } from './SettingsControls'

export const GeneralTab = () => {
  const { t } = useTranslation()
  const settings = useSettingsStore((state) => state.settings)
  const updateSetting = useSettingsStore((state) => state.updateSetting)

  return (
    <div className="settings-tab-content settings-animate-in">
      <SettingsSection
        title={t('settings.general.application')}
        description={t('settings.general.applicationDesc')}
      >
        <SettingsRow
          label={t('settings.general.language')}
          description={t('settings.general.languageDesc')}
          htmlFor="application-language"
        >
          <SettingsSelect
            id="application-language"
            width="narrow"
            value={settings.language || 'en'}
            onChange={(event) => updateSetting('language', event.target.value)}
          >
            {SUPPORTED_LANGUAGES.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </SettingsSelect>
        </SettingsRow>

        <SettingsToggleRow
          label={t('settings.general.autoUpdates')}
          description={t('settings.general.autoUpdatesDesc')}
          checked={settings.autoUpdateEnabled !== false}
          onChange={(checked) => updateSetting('autoUpdateEnabled', checked)}
        />

        <SettingsRow
          label={t('settings.general.checkUpdatesNow')}
          description={t('settings.general.checkUpdatesNowDesc')}
        >
          <button
            type="button"
            className="primary-button settings-nowrap"
            onClick={() => void checkForAppUpdate({ interactive: true })}
          >
            {t('settings.general.checkNow')}
          </button>
        </SettingsRow>
      </SettingsSection>
    </div>
  )
}

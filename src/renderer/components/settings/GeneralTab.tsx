import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BookOpen, Check, RotateCcw } from 'lucide-react'
import { SUPPORTED_LANGUAGES } from '../../i18n'
import { checkForAppUpdate } from '../../services/updateLifecycle'
import { useSettingsStore } from '../../store/useSettingsStore'
import { useLearningStore } from '../../store/useLearningStore'
import { useUiStore } from '../../store/useUiStore'
import { ICON_SIZE } from '../ui/IconSystem'
import { SettingsRow, SettingsSection, SettingsSelect, SettingsToggleRow } from './SettingsControls'

export const GeneralTab = () => {
  const { t } = useTranslation()
  const settings = useSettingsStore((state) => state.settings)
  const updateSetting = useSettingsStore((state) => state.updateSetting)
  const resetHints = useLearningStore((state) => state.resetHints)
  const [hintsReset, setHintsReset] = useState(false)

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

      <SettingsSection
        title={t('settings.general.learning')}
        description={t('settings.general.learningDesc')}
      >
        <SettingsRow
          label={t('settings.general.openGuide')}
          description={t('settings.general.openGuideDesc')}
        >
          <button
            type="button"
            className="primary-button settings-inline-action settings-nowrap"
            onClick={() => useUiStore.getState().requestHelp('quick-start')}
          >
            <BookOpen size={ICON_SIZE.compact} aria-hidden="true" />
            {t('settings.general.openGuideAction')}
          </button>
        </SettingsRow>

        <SettingsRow
          label={t('settings.general.featureHints')}
          description={t(
            hintsReset ? 'settings.general.featureHintsReset' : 'settings.general.featureHintsDesc'
          )}
        >
          <button
            type="button"
            className="settings-secondary-button settings-inline-action settings-nowrap"
            onClick={() => {
              resetHints()
              setHintsReset(true)
            }}
          >
            {hintsReset ? (
              <Check size={ICON_SIZE.compact} aria-hidden="true" />
            ) : (
              <RotateCcw size={ICON_SIZE.compact} aria-hidden="true" />
            )}
            <span aria-live="polite">
              {t(hintsReset ? 'settings.general.resetHintsDone' : 'settings.general.resetHints')}
            </span>
          </button>
        </SettingsRow>
      </SettingsSection>
    </div>
  )
}

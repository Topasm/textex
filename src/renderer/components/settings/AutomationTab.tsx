import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../store/useSettingsStore'
import { TectonicCacheSettings } from './TectonicCacheSettings'
import { SettingsRow, SettingsSection, SettingsSelect, SettingsToggleRow } from './SettingsControls'

export const AutomationTab = () => {
  const { t } = useTranslation()
  const settings = useSettingsStore((state) => state.settings)
  const updateSetting = useSettingsStore((state) => state.updateSetting)

  return (
    <div className="settings-tab-content settings-animate-in">
      <SettingsSection title={t('settings.automation.compilerTools')}>
        <SettingsRow
          label={t('settings.automation.compilerEngine')}
          description={
            settings.latexEngine === 'pdf-latex'
              ? t('settings.automation.pdfLatexDesc')
              : t('settings.automation.tectonicDesc')
          }
          htmlFor="latex-engine-select"
        >
          <SettingsSelect
            id="latex-engine-select"
            value={settings.latexEngine}
            onChange={(event) =>
              updateSetting('latexEngine', event.target.value as typeof settings.latexEngine)
            }
          >
            <option value="tectonic">{t('settings.automation.tectonicOption')}</option>
            <option value="pdf-latex">{t('settings.automation.pdfLatexOption')}</option>
          </SettingsSelect>
        </SettingsRow>

        <SettingsToggleRow
          label={t('settings.automation.autoCompile')}
          description={t('settings.automation.autoCompileDesc')}
          checked={settings.autoCompile}
          onChange={(checked) => updateSetting('autoCompile', checked)}
        />

        <SettingsToggleRow
          label={t('settings.automation.watchOpenFiles')}
          description={t('settings.automation.watchOpenFilesDesc')}
          checked={settings.watchOpenFiles}
          onChange={(checked) => updateSetting('watchOpenFiles', checked)}
        />

        <SettingsToggleRow
          label={t('settings.automation.spellCheck')}
          description={t('settings.automation.spellCheckDesc')}
          checked={settings.spellCheckEnabled}
          onChange={(checked) => updateSetting('spellCheckEnabled', checked)}
        />

        {settings.spellCheckEnabled && (
          <div className="settings-spellcheck-sub">
            <label className="settings-label" htmlFor="spell-language-select">
              {t('settings.automation.spellLanguage')}
            </label>
            <SettingsSelect
              id="spell-language-select"
              value={settings.spellCheckLanguage ?? 'en-US'}
              onChange={(event) => {
                updateSetting('spellCheckLanguage', event.target.value)
                void window.api.spellSetLanguage(event.target.value)
              }}
            >
              <option value="en-US">English (US)</option>
            </SettingsSelect>
          </div>
        )}
      </SettingsSection>
      {settings.latexEngine === 'tectonic' && (
        <>
          <hr className="settings-divider" />
          <TectonicCacheSettings />
        </>
      )}
    </div>
  )
}

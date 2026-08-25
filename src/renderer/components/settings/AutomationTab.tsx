import React from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../store/useSettingsStore'
import { Toggle } from './Toggle'
import { TectonicCacheSettings } from './TectonicCacheSettings'

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
              <label className="settings-row-label" htmlFor="latex-engine-select">
                {t('settings.automation.compilerEngine')}
              </label>
              <div className="settings-row-description">
                {settings.latexEngine === 'pdf-latex'
                  ? t('settings.automation.pdfLatexDesc')
                  : t('settings.automation.tectonicDesc')}
              </div>
            </div>
            <select
              id="latex-engine-select"
              value={settings.latexEngine}
              onChange={(event) =>
                updateSetting('latexEngine', event.target.value as typeof settings.latexEngine)
              }
              className="settings-select settings-select-medium"
            >
              <option value="tectonic">{t('settings.automation.tectonicOption')}</option>
              <option value="pdf-latex">{t('settings.automation.pdfLatexOption')}</option>
            </select>
          </div>
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
              <div className="settings-row-label">{t('settings.automation.watchOpenFiles')}</div>
              <div className="settings-row-description">
                {t('settings.automation.watchOpenFilesDesc')}
              </div>
            </div>
            <Toggle
              checked={settings.watchOpenFiles}
              onChange={(checked) => updateSetting('watchOpenFiles', checked)}
            />
          </div>
          <>
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
                    void window.api.spellSetLanguage(e.target.value)
                  }}
                  className="settings-select settings-select-medium"
                >
                  <option value="en-US">English (US)</option>
                </select>
              </div>
            )}
          </>
        </div>
      </div>
      {settings.latexEngine === 'tectonic' && (
        <>
          <hr className="settings-divider" />
          <TectonicCacheSettings />
        </>
      )}
    </div>
  )
}

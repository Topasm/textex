import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../store/useSettingsStore'
import { TectonicCacheSettings } from './TectonicCacheSettings'
import { SettingsRow, SettingsSection, SettingsSelect, SettingsToggleRow } from './SettingsControls'
import { SettingsSearchBlock } from './SettingsSearch'

const CACHE_COPY_KEYS = [
  'offlineCache',
  'offlineCacheDesc',
  'packagedSeed',
  'writableCache',
  'networkFallback',
  'cacheRecheck',
  'cacheReset'
] as const

export const CompilerSettings = () => {
  const { t } = useTranslation()
  const settings = useSettingsStore((state) => state.settings)
  const updateSetting = useSettingsStore((state) => state.updateSetting)
  const engineOptions = [
    t('settings.compiler.tectonicOption'),
    t('settings.compiler.pdfLatexOption')
  ]

  return (
    <>
      <SettingsSection title={t('settings.compiler.compilerTools')}>
        <SettingsRow
          label={t('settings.compiler.compilerEngine')}
          description={
            settings.latexEngine === 'pdf-latex'
              ? t('settings.compiler.pdfLatexDesc')
              : t('settings.compiler.tectonicDesc')
          }
          keywords={engineOptions}
          htmlFor="latex-engine-select"
        >
          <SettingsSelect
            id="latex-engine-select"
            value={settings.latexEngine}
            onChange={(event) =>
              updateSetting('latexEngine', event.target.value as typeof settings.latexEngine)
            }
          >
            <option value="tectonic">{t('settings.compiler.tectonicOption')}</option>
            <option value="pdf-latex">{t('settings.compiler.pdfLatexOption')}</option>
          </SettingsSelect>
        </SettingsRow>

        <SettingsToggleRow
          label={t('settings.compiler.autoCompile')}
          description={t('settings.compiler.autoCompileDesc')}
          checked={settings.autoCompile}
          onChange={(checked) => updateSetting('autoCompile', checked)}
        />

        <SettingsToggleRow
          label={t('settings.compiler.watchOpenFiles')}
          description={t('settings.compiler.watchOpenFilesDesc')}
          checked={settings.watchOpenFiles}
          onChange={(checked) => updateSetting('watchOpenFiles', checked)}
        />

        <SettingsToggleRow
          label={t('settings.compiler.spellCheck')}
          description={t('settings.compiler.spellCheckDesc')}
          keywords={[t('settings.compiler.spellLanguage')]}
          checked={settings.spellCheckEnabled}
          onChange={(checked) => updateSetting('spellCheckEnabled', checked)}
        />

        {settings.spellCheckEnabled && (
          <SettingsRow
            label={t('settings.compiler.spellLanguage')}
            keywords={[t('settings.compiler.spellCheck')]}
            htmlFor="spell-language-select"
          >
            <SettingsSelect
              id="spell-language-select"
              width="narrow"
              value={settings.spellCheckLanguage ?? 'en-US'}
              onChange={(event) => {
                updateSetting('spellCheckLanguage', event.target.value)
                void window.api.spellSetLanguage(event.target.value)
              }}
            >
              <option value="en-US">English (US)</option>
            </SettingsSelect>
          </SettingsRow>
        )}
      </SettingsSection>

      {settings.latexEngine === 'tectonic' && (
        <SettingsSearchBlock keywords={CACHE_COPY_KEYS.map((key) => t(`settings.compiler.${key}`))}>
          <div className="settings-pane-section">
            <TectonicCacheSettings />
          </div>
        </SettingsSearchBlock>
      )}
    </>
  )
}

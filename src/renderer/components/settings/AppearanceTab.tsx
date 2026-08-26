import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../store/useSettingsStore'
import type { UserSettings } from '../../../shared/types'
import { Moon, Sun, Monitor, Sparkles, Check, Contrast } from 'lucide-react'
import {
  SettingsRow,
  SettingsSection,
  SettingsSegmentedControl,
  SettingsToggleRow
} from './SettingsControls'

export const AppearanceTab = () => {
  const { t } = useTranslation()
  const settings = useSettingsStore((state) => state.settings)
  const updateSetting = useSettingsStore((state) => state.updateSetting)

  return (
    <div className="settings-tab-content settings-animate-in">
      <SettingsSection
        title={t('settings.appearance.theme')}
        description={t('settings.appearance.themeDesc')}
      >
        <div className="settings-theme-grid">
          {[
            { id: 'light', label: t('settings.appearance.light'), icon: Sun },
            { id: 'dark', label: t('settings.appearance.dark'), icon: Moon },
            {
              id: 'high-contrast',
              label: t('settings.appearance.highContrast'),
              icon: Contrast
            },
            { id: 'glass', label: t('settings.appearance.glass'), icon: Sparkles },
            { id: 'system', label: t('settings.appearance.system'), icon: Monitor }
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => {
                const newTheme = mode.id as UserSettings['theme']
                updateSetting('theme', newTheme)
              }}
              className={`settings-theme-card${settings.theme === mode.id ? ' selected' : ''}`}
              aria-pressed={settings.theme === mode.id}
            >
              <div className="settings-theme-card-icon">
                <mode.icon size={20} />
              </div>
              <span className="settings-theme-card-label">{mode.label}</span>
              {settings.theme === mode.id && (
                <div className="settings-theme-card-check">
                  <Check size={16} />
                </div>
              )}
            </button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('settings.appearance.pdfDisplay')}
        description={t('settings.appearance.pdfDisplayDesc')}
      >
        <SettingsToggleRow
          label={t('settings.appearance.pdfNightMode')}
          description={t('settings.appearance.pdfNightModeDesc')}
          checked={settings.pdfInvertMode ?? false}
          onChange={(checked) => updateSetting('pdfInvertMode', checked)}
        />

        <SettingsRow
          label={t('settings.appearance.pdfViewMode')}
          description={t('settings.appearance.pdfViewModeDesc')}
        >
          <SettingsSegmentedControl
            label={t('settings.appearance.pdfViewMode')}
            value={settings.pdfViewMode ?? 'continuous'}
            options={[
              {
                value: 'continuous',
                label: t('settings.appearance.pdfViewModeContinuous')
              },
              { value: 'single', label: t('settings.appearance.pdfViewModeSingle') }
            ]}
            onChange={(value) => updateSetting('pdfViewMode', value)}
          />
        </SettingsRow>

        <SettingsToggleRow
          label={t('settings.appearance.showPdfToolbarControls')}
          description={t('settings.appearance.showPdfToolbarControlsDesc')}
          checked={settings.showPdfToolbarControls !== false}
          onChange={(checked) => updateSetting('showPdfToolbarControls', checked)}
        />

        <SettingsToggleRow
          label={t('settings.appearance.scrollSync')}
          description={t('settings.appearance.scrollSyncDesc')}
          checked={!!settings.scrollSyncEnabled}
          onChange={(checked) => updateSetting('scrollSyncEnabled', checked)}
        />
      </SettingsSection>
    </div>
  )
}

import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../store/useSettingsStore'
import type { UserSettings } from '../../../shared/types'
import { Moon, Sun, Monitor, Sparkles, Check } from 'lucide-react'
import { Toggle } from './Toggle'

export const AppearanceTab = () => {
  const { t } = useTranslation()
  const settings = useSettingsStore((state) => state.settings)
  const updateSetting = useSettingsStore((state) => state.updateSetting)

  return (
    <div className="settings-tab-content settings-animate-in">
      <div>
        <h3 className="settings-heading">{t('settings.appearance.theme')}</h3>
        <p className="settings-subheading">{t('settings.appearance.themeDesc')}</p>

        <div className="settings-theme-grid">
          {[
            { id: 'light', label: t('settings.appearance.light'), icon: Sun },
            { id: 'dark', label: t('settings.appearance.dark'), icon: Moon },
            { id: 'glass', label: t('settings.appearance.glass'), icon: Sparkles },
            { id: 'system', label: t('settings.appearance.system'), icon: Monitor }
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => {
                const newTheme = mode.id as UserSettings['theme']
                updateSetting('theme', newTheme)
                if (newTheme === 'dark') {
                  updateSetting('pdfInvertMode', true)
                } else if (newTheme === 'light' || newTheme === 'glass') {
                  updateSetting('pdfInvertMode', false)
                } else if (newTheme === 'system') {
                  const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
                  updateSetting('pdfInvertMode', isSystemDark)
                }
              }}
              className={`settings-theme-card${settings.theme === mode.id ? ' selected' : ''}`}
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
      </div>

      <hr className="settings-divider" />

      <div className="settings-row">
        <div>
          <div className="settings-row-label">{t('settings.appearance.pdfNightMode')}</div>
          <div className="settings-row-description">
            {t('settings.appearance.pdfNightModeDesc')}
          </div>
        </div>
        <Toggle
          checked={settings.pdfInvertMode}
          onChange={(checked) => updateSetting('pdfInvertMode', checked)}
        />
      </div>

      <hr className="settings-divider" />

      <div className="settings-row">
        <div>
          <div className="settings-row-label">{t('settings.appearance.pdfViewMode')}</div>
          <div className="settings-row-description">
            {t('settings.appearance.pdfViewModeDesc')}
          </div>
        </div>
        <div className="settings-segmented-control">
          <button
            className={(settings.pdfViewMode ?? 'continuous') === 'continuous' ? 'active' : ''}
            onClick={() => updateSetting('pdfViewMode', 'continuous')}
          >
            {t('settings.appearance.pdfViewModeContinuous')}
          </button>
          <button
            className={(settings.pdfViewMode ?? 'continuous') === 'single' ? 'active' : ''}
            onClick={() => updateSetting('pdfViewMode', 'single')}
          >
            {t('settings.appearance.pdfViewModeSingle')}
          </button>
        </div>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-row-label">{t('settings.appearance.showPdfToolbarControls')}</div>
          <div className="settings-row-description">
            {t('settings.appearance.showPdfToolbarControlsDesc')}
          </div>
        </div>
        <Toggle
          checked={settings.showPdfToolbarControls !== false}
          onChange={(checked) => updateSetting('showPdfToolbarControls', checked)}
        />
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-row-label">{t('settings.appearance.scrollSync')}</div>
          <div className="settings-row-description">
            {t('settings.appearance.scrollSyncDesc')}
          </div>
        </div>
        <Toggle
          checked={!!settings.scrollSyncEnabled}
          onChange={(checked) => updateSetting('scrollSyncEnabled', checked)}
        />
      </div>
    </div>
  )
}

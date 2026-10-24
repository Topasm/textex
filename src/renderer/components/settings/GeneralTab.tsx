import { GeneralSettings } from './GeneralSettings'
import { AppearanceSettings } from './AppearanceSettings'

/** Application-wide preferences: language, updates, help, theme, PDF display. */
export const GeneralTab = () => (
  <div className="settings-tab-content settings-animate-in">
    <GeneralSettings />
    <AppearanceSettings />
  </div>
)

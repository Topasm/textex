import { AiSettings } from './AiSettings'
import { IntegrationsSettings } from './IntegrationsSettings'

/** External services: AI providers, Zotero, Git. */
export const AiTab = () => (
  <div className="settings-tab-content settings-animate-in ai-settings-tab">
    <AiSettings />
    <IntegrationsSettings />
  </div>
)

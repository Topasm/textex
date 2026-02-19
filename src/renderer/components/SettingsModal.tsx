import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Palette, Type, Zap, Link, Settings as SettingsIcon, User, Bot } from 'lucide-react'
import { GeneralTab } from './settings/GeneralTab'
import { AppearanceTab } from './settings/AppearanceTab'
import { EditorTab } from './settings/EditorTab'
import { AiTab } from './settings/AiTab'
import { IntegrationsTab } from './settings/IntegrationsTab'
import { AutomationTab } from './settings/AutomationTab'

type TabId = 'general' | 'appearance' | 'editor' | 'ai' | 'integrations' | 'automation'

const TAB_ICONS = {
  general: User,
  appearance: Palette,
  editor: Type,
  ai: Bot,
  integrations: Link,
  automation: Zap
} as const

const TAB_CONTENT: Record<TabId, React.FC> = {
  general: GeneralTab,
  appearance: AppearanceTab,
  editor: EditorTab,
  ai: AiTab,
  integrations: IntegrationsTab,
  automation: AutomationTab
}

const TAB_IDS: TabId[] = ['general', 'appearance', 'editor', 'ai', 'integrations', 'automation']

export const SettingsModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<TabId>('general')
  const ActiveContent = TAB_CONTENT[activeTab]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content settings-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SettingsIcon size={18} />
            <h2>{t('settings.title')}</h2>
          </div>
          <button onClick={onClose} className="close-button">
            <X size={18} />
          </button>
        </div>

        <div className="settings-layout">
          {/* Sidebar */}
          <div className="settings-sidebar">
            {TAB_IDS.map((id) => {
              const Icon = TAB_ICONS[id]
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`settings-tab${activeTab === id ? ' active' : ''}`}
                >
                  <Icon size={18} />
                  {t(`settings.tabs.${id}`)}
                </button>
              )
            })}
          </div>

          {/* Content */}
          <div className="settings-content">
            <ActiveContent />
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>TexTex v1.0.0</span>
          <span
            style={{
              fontSize: 12,
              fontFamily: 'monospace',
              color: 'var(--text-secondary)',
              opacity: 0.5
            }}
          >
            Build 2026
          </span>
        </div>
      </div>
    </div>
  )
}

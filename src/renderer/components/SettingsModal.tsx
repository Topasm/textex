import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Palette, Type, Zap, Link, Settings as SettingsIcon, User, Bot } from 'lucide-react'
import { GeneralTab } from './settings/GeneralTab'
import { AppearanceTab } from './settings/AppearanceTab'
import { EditorTab } from './settings/EditorTab'
import { AiTab } from './settings/AiTab'
import { IntegrationsTab } from './settings/IntegrationsTab'
import { AutomationTab } from './settings/AutomationTab'
import { getDesktopCapabilities } from '../platform/capabilities'
import UpdateNotification from './UpdateNotification'

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

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

export const SettingsModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation()
  const capabilities = getDesktopCapabilities()
  const [activeTab, setActiveTab] = useState<TabId>('general')
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const initialFocusRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  const ActiveContent = TAB_CONTENT[activeTab]
  const tabIds = capabilities.ai ? TAB_IDS : TAB_IDS.filter((id) => id !== 'ai')

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    initialFocusRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return

      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab') return

      const dialog = dialogRef.current
      if (!dialog) return

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.getAttribute('aria-hidden') !== 'true'
      )
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = focusable[0]
      const last = focusable.at(-1)
      if (!last) return

      if (!dialog.contains(document.activeElement)) {
        event.preventDefault()
        if (event.shiftKey) last.focus()
        else first.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [])

  return (
    <div
      className="modal-overlay"
      role="presentation"
      data-app-overlay-owner="settings"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="modal-content settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SettingsIcon size={18} />
            <h2 id={titleId}>{t('settings.title')}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="close-button"
            aria-label={t('logPanel.close')}
          >
            <X size={18} />
          </button>
        </div>

        <UpdateNotification />

        <div className="settings-layout">
          {/* Sidebar */}
          <div className="settings-sidebar">
            {tabIds.map((id) => {
              const Icon = TAB_ICONS[id]
              return (
                <button
                  key={id}
                  ref={id === 'general' ? initialFocusRef : undefined}
                  type="button"
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
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>TextEx v1.0.9</span>
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

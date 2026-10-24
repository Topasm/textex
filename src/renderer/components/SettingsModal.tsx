import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  Bot,
  Search,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Type,
  X
} from 'lucide-react'
import { GeneralTab } from './settings/GeneralTab'
import { EditorTab } from './settings/EditorTab'
import { AiTab } from './settings/AiTab'
import {
  SettingsSearchProvider,
  collectSettingsCopy,
  foldSettingsSearchText,
  tokenizeSettingsSearch
} from './settings/SettingsSearch'
import UpdateNotification from './UpdateNotification'
import { ICON_SIZE } from './ui/IconSystem'
import { ModalCloseButton } from './ui/ModalChrome'
import { AppPageFrame } from './ui/AppPageFrame'

export type SettingsTabId = 'general' | 'editor' | 'ai'

export const TAB_IDS: readonly SettingsTabId[] = ['general', 'editor', 'ai']

/**
 * The `settings.*` translation namespaces each tab is built from. The tab
 * filter is a secondary effect of the row-level search: a tab stays listed
 * while any copy in its namespaces matches the query.
 */
export const SETTINGS_TAB_NAMESPACES: Record<SettingsTabId, readonly string[]> = {
  general: ['general', 'appearance'],
  editor: ['editor', 'compiler'],
  ai: ['ai', 'integrations']
}

const TAB_ICONS: Record<SettingsTabId, typeof SlidersHorizontal> = {
  general: SlidersHorizontal,
  editor: Type,
  ai: Bot
}

const TAB_CONTENT: Record<SettingsTabId, React.FC> = {
  general: GeneralTab,
  editor: EditorTab,
  ai: AiTab
}

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
  const [activeTab, setActiveTab] = useState<SettingsTabId>('general')
  const [query, setQuery] = useState('')
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const initialFocusRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const queryRef = useRef(query)
  const onCloseRef = useRef(onClose)
  const queryTokens = useMemo(() => tokenizeSettingsSearch(query), [query])
  const tabSearchIndex = useMemo(
    () =>
      Object.fromEntries(
        TAB_IDS.map((id) => [
          id,
          foldSettingsSearchText(
            [
              t(`settings.tabs.${id}`),
              t(`settings.tabSummaries.${id}`),
              ...SETTINGS_TAB_NAMESPACES[id].flatMap((namespace) =>
                collectSettingsCopy(t(`settings.${namespace}`, { returnObjects: true }) as unknown)
              )
            ].join(' ')
          )
        ])
      ) as Record<SettingsTabId, string>,
    [t]
  )
  const visibleTabIds = useMemo(
    () =>
      queryTokens.length === 0
        ? TAB_IDS
        : TAB_IDS.filter((id) => queryTokens.every((token) => tabSearchIndex[id].includes(token))),
    [queryTokens, tabSearchIndex]
  )
  const resolvedActiveTab = visibleTabIds.includes(activeTab) ? activeTab : visibleTabIds[0]
  const ActiveContent = resolvedActiveTab ? TAB_CONTENT[resolvedActiveTab] : null

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    queryRef.current = query
  }, [query])

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    initialFocusRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return

      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (queryRef.current) {
          setQuery('')
          searchRef.current?.focus()
        } else {
          onCloseRef.current()
        }
        return
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
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
    <AppPageFrame ref={dialogRef} owner="settings" titleId={titleId} className="settings-page">
      <header className="app-page-header settings-page-header">
        <div className="app-page-title settings-page-title">
          <button
            type="button"
            className="app-page-back"
            aria-label={t('settings.backToWorkspace')}
            title={t('settings.backToWorkspace')}
            onClick={onClose}
          >
            <ArrowLeft size={ICON_SIZE.control} aria-hidden="true" />
          </button>
          <span className="settings-page-mark" aria-hidden="true">
            <SettingsIcon size={ICON_SIZE.feature} />
          </span>
          <h1 id={titleId}>{t('settings.title')}</h1>
        </div>

        <div className="settings-search">
          <Search size={ICON_SIZE.control} aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('settings.searchPlaceholder')}
            aria-label={t('settings.searchLabel')}
          />
          {query && (
            <button
              type="button"
              className="settings-search-clear"
              aria-label={t('settings.clearSearch')}
              onClick={() => {
                setQuery('')
                searchRef.current?.focus()
              }}
            >
              <X size={ICON_SIZE.compact} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="settings-page-actions">
          <kbd aria-hidden="true">Esc</kbd>
          <ModalCloseButton
            className="app-page-close"
            onClick={onClose}
            label={t('logPanel.close')}
          />
        </div>
      </header>

      <UpdateNotification />

      <div className="settings-layout">
        <nav className="settings-sidebar" aria-label={t('settings.title')}>
          {visibleTabIds.map((id) => {
            const Icon = TAB_ICONS[id]
            return (
              <button
                key={id}
                ref={id === 'general' ? initialFocusRef : undefined}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`settings-tab${resolvedActiveTab === id ? ' active' : ''}`}
                aria-current={resolvedActiveTab === id ? 'page' : undefined}
                aria-label={t(`settings.tabs.${id}`)}
              >
                <Icon size={ICON_SIZE.control} aria-hidden="true" />
                <span className="settings-tab-copy">
                  <span className="settings-tab-label">{t(`settings.tabs.${id}`)}</span>
                  <span className="settings-tab-summary">{t(`settings.tabSummaries.${id}`)}</span>
                </span>
              </button>
            )
          })}
          {visibleTabIds.length === 0 && (
            <p className="settings-sidebar-empty">{t('settings.noResultsTitle')}</p>
          )}
          <span className="settings-version">TextEx v{__APP_VERSION__}</span>
        </nav>

        <main className="settings-content">
          <div className="settings-content-inner">
            {ActiveContent ? (
              <SettingsSearchProvider query={query}>
                {queryTokens.length > 0 && (
                  <p className="settings-search-hint">
                    {t('settings.searchResultsHint', { query })}
                  </p>
                )}
                <ActiveContent />
              </SettingsSearchProvider>
            ) : (
              <div className="settings-empty-state" role="status">
                <Search size={ICON_SIZE.prominent} aria-hidden="true" />
                <h2>{t('settings.noResultsTitle')}</h2>
                <p>{t('settings.noResultsDescription', { query })}</p>
                <button
                  type="button"
                  className="settings-secondary-button"
                  onClick={() => setQuery('')}
                >
                  {t('settings.clearSearch')}
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    </AppPageFrame>
  )
}

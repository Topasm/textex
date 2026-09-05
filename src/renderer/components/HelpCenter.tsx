import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  CircleHelp,
  Command,
  Compass,
  FileText,
  FolderKanban,
  GripVertical,
  Keyboard,
  Library,
  LockKeyhole,
  Maximize2,
  MousePointer2,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  X,
  ZoomIn
} from 'lucide-react'
import {
  LEARN_ITEMS,
  LEARN_SECTIONS,
  TOUR_ITEMS,
  type LearnItem,
  type LearnVisual,
  type TourItem
} from '../../shared/learnCatalog'
import type { LearnSectionId } from '../../shared/learningIds'
import type { AppCommandId } from '../../shared/types'
import {
  APP_COMMAND_MANIFEST,
  RENDERER_SHORTCUT_MANIFEST,
  type RendererShortcutId
} from '../../shared/appCommandManifest'
import {
  commandShortcutHint,
  commandTranslationKey,
  formatCommandShortcut,
  normalizeCommandSearchText,
  type CommandAvailabilityContext
} from '../services/commandSearch'
import { useLearningStore } from '../store/useLearningStore'
import { ICON_SIZE } from './ui/IconSystem'
import { ModalCloseButton } from './ui/ModalChrome'
import { AppPageFrame } from './ui/AppPageFrame'
import '../styles/help-center.css'

interface HelpCenterProps {
  initialSection?: LearnSectionId
  context: CommandAvailabilityContext
  onClose: () => void
  onBack?: () => void
  onRunCommand: (command: AppCommandId) => void
}

const SECTION_ICONS: Record<LearnSectionId, ComponentType<{ size?: number }>> = {
  tour: Compass,
  'quick-start': Sparkles,
  gestures: MousePointer2,
  writing: FileText,
  research: Library,
  ai: Bot,
  project: FolderKanban,
  shortcuts: Keyboard
}

const VISUAL_ICONS: Record<LearnVisual, ComponentType<{ size?: number }>> = {
  start: FolderKanban,
  compile: Play,
  commands: Command,
  swipe: ArrowLeftRight,
  page: FileText,
  zoom: ZoomIn,
  tabs: ChevronRight,
  resize: GripVertical,
  sync: Maximize2,
  references: Library,
  chat: Bot,
  project: FolderKanban
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

const RENDERER_SHORTCUT_LABEL_KEYS: Record<RendererShortcutId, string> = {
  'commandPalette.open': 'commandPalette.title',
  'files.open': 'localSearch.files',
  'font.increase': 'learning.shortcutLabels.increaseFont',
  'font.decrease': 'learning.shortcutLabels.decreaseFont',
  'tab.close': 'learning.shortcutLabels.closeTab',
  'tab.prev': 'learning.shortcutLabels.previousTab',
  'tab.next': 'learning.shortcutLabels.nextTab'
}

const SECTION_BY_ID = Object.fromEntries(
  LEARN_SECTIONS.map((section) => [section.id, section])
) as Record<LearnSectionId, (typeof LEARN_SECTIONS)[number]>

const SECTION_NUMBER_BY_ID = Object.fromEntries(
  LEARN_SECTIONS.map((section, index) => [section.id, index + 1])
) as Record<LearnSectionId, number>

const ITEMS_BY_SECTION = LEARN_ITEMS.reduce<Record<LearnSectionId, LearnItem[]>>(
  (sections, item) => {
    sections[item.sectionId].push(item)
    return sections
  },
  {
    tour: [],
    'quick-start': [],
    gestures: [],
    writing: [],
    research: [],
    ai: [],
    project: [],
    shortcuts: []
  }
)

function requiredContextAvailable(
  required: LearnItem['requiredContext'] | TourItem['requiredContext'],
  context: CommandAvailabilityContext
): boolean {
  return !required || context[required]
}

const LearningCard = memo(function LearningCard({
  item,
  context,
  showSectionLabel,
  onRunCommand
}: {
  item: LearnItem
  context: CommandAvailabilityContext
  showSectionLabel: boolean
  onRunCommand: (command: AppCommandId) => void
}) {
  const { t } = useTranslation()
  const Icon = VISUAL_ICONS[item.visual]
  const available = requiredContextAvailable(item.requiredContext, context)
  const shortcut = item.shortcutId ? commandShortcutHint(item.shortcutId) : null
  const actionCommandId = item.actionCommandId
  const section = SECTION_BY_ID[item.sectionId]

  return (
    <article className={`help-card${available ? '' : ' help-card-unavailable'}`}>
      <div className="help-card-icon" aria-hidden="true">
        <Icon size={ICON_SIZE.feature} />
      </div>
      <div className="help-card-copy">
        {showSectionLabel && section && (
          <span className="help-card-section">{t(section.titleKey)}</span>
        )}
        <h3>{t(item.titleKey)}</h3>
        <p>{t(item.descriptionKey)}</p>
        {item.gestureInputKey && item.alternativeKey && (
          <div className="help-gesture-pair">
            <span className="help-input-method">
              <span className="help-input-label">
                <MousePointer2 size={ICON_SIZE.compact} aria-hidden="true" />
                {t('learning.input.trackpad')}
              </span>
              <strong>{t(item.gestureInputKey)}</strong>
            </span>
            <span className="help-input-method">
              <span className="help-input-label">
                <Keyboard size={ICON_SIZE.compact} aria-hidden="true" />
                {t('learning.input.alternative')}
              </span>
              <strong>{t(item.alternativeKey)}</strong>
            </span>
          </div>
        )}
      </div>
      <div className="help-card-actions">
        {shortcut && <kbd>{shortcut}</kbd>}
        {!available && item.requiredContext && (
          <span className="help-context-requirement">
            <LockKeyhole size={ICON_SIZE.micro} aria-hidden="true" />
            {t(`commandPalette.requires.${item.requiredContext}`)}
          </span>
        )}
        {actionCommandId && (
          <button
            type="button"
            className="help-action-button"
            disabled={!available}
            title={
              available || !item.requiredContext
                ? undefined
                : t(`commandPalette.requires.${item.requiredContext}`)
            }
            onClick={() => onRunCommand(actionCommandId)}
          >
            {available ? (
              <ArrowRight size={ICON_SIZE.compact} aria-hidden="true" />
            ) : (
              <LockKeyhole size={ICON_SIZE.compact} aria-hidden="true" />
            )}
            {available ? t('learning.tryAction') : t('learning.unavailable')}
          </button>
        )}
      </div>
    </article>
  )
})

const TourChecklist = memo(function TourChecklist({
  context,
  onRunCommand
}: {
  context: CommandAvailabilityContext
  onRunCommand: (command: AppCommandId) => void
}) {
  const { t } = useTranslation()
  const completed = useLearningStore((state) => state.completedTourItemIds)
  const setComplete = useLearningStore((state) => state.setTourItemComplete)
  const resetTour = useLearningStore((state) => state.resetTour)
  const percent = Math.round((completed.length / TOUR_ITEMS.length) * 100)

  return (
    <div className="help-tour">
      <div className="help-tour-overview">
        <div className="help-tour-progress-copy">
          <strong>
            {t('learning.tour.progress', { completed: completed.length, total: TOUR_ITEMS.length })}
          </strong>
          <span>{t('learning.tour.progressHint')}</span>
        </div>
        <div className="help-tour-ring" aria-hidden="true">
          <svg viewBox="0 0 48 48">
            <circle className="help-tour-ring-track" cx="24" cy="24" r="20" pathLength="100" />
            <circle
              className="help-tour-ring-value"
              cx="24"
              cy="24"
              r="20"
              pathLength="100"
              strokeDashoffset={100 - percent}
            />
          </svg>
          <span>{percent}%</span>
        </div>
      </div>
      <progress
        value={completed.length}
        max={TOUR_ITEMS.length}
        aria-label={t('learning.tour.progressLabel')}
      />
      <div className="help-tour-list">
        {TOUR_ITEMS.map((item, index) => {
          const checked = completed.includes(item.id)
          const available = requiredContextAvailable(item.requiredContext, context)
          const actionCommandId = item.actionCommandId
          return (
            <article className={`help-tour-item${checked ? ' complete' : ''}`} key={item.id}>
              <label>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => setComplete(item.id, event.target.checked)}
                />
                <span className="help-tour-check" aria-hidden="true">
                  {checked ? <Check size={ICON_SIZE.compact} /> : index + 1}
                </span>
                <span>
                  <strong>{t(item.titleKey)}</strong>
                  <small>{t(item.descriptionKey)}</small>
                </span>
              </label>
              {actionCommandId && (
                <button
                  type="button"
                  className="help-action-button"
                  disabled={!available}
                  onClick={() => {
                    setComplete(item.id, true)
                    onRunCommand(actionCommandId)
                  }}
                >
                  <ArrowRight size={ICON_SIZE.compact} aria-hidden="true" />
                  {available ? t('learning.tryAction') : t('learning.unavailable')}
                </button>
              )}
            </article>
          )
        })}
      </div>
      <button type="button" className="help-reset-button" onClick={resetTour}>
        <RotateCcw size={ICON_SIZE.compact} aria-hidden="true" />
        {t('learning.tour.reset')}
      </button>
    </div>
  )
})

interface HelpShortcut {
  readonly id: string
  readonly label: string
  readonly shortcut: string
  readonly available: boolean
  readonly searchText: string
}

const ShortcutList = memo(function ShortcutList({
  shortcuts
}: {
  shortcuts: readonly HelpShortcut[]
}) {
  return (
    <div className="help-shortcut-list">
      {shortcuts.map((shortcut) => (
        <div
          className={`help-shortcut-row${shortcut.available ? '' : ' unavailable'}`}
          key={shortcut.id}
        >
          <span>{shortcut.label}</span>
          <kbd>{shortcut.shortcut}</kbd>
        </div>
      ))}
    </div>
  )
})

export const HelpCenter = memo(function HelpCenter({
  initialSection = 'quick-start',
  context,
  onClose,
  onBack,
  onRunCommand
}: HelpCenterProps) {
  const { t } = useTranslation()
  const [activeSection, setActiveSection] = useState<LearnSectionId>(initialSection)
  const [query, setQuery] = useState('')
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => setActiveSection(initialSection), [initialSection])

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    searchRef.current?.focus()
    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [])

  const normalizedQuery = useMemo(() => normalizeCommandSearchText(query), [query])
  const queryTokens = useMemo(
    () => normalizedQuery.split(/\s+/u).filter(Boolean),
    [normalizedQuery]
  )
  const isSearching = queryTokens.length > 0

  const localizedItemIndex = useMemo(
    () =>
      LEARN_ITEMS.map((item) => ({
        item,
        searchText: normalizeCommandSearchText(
          [
            t(item.titleKey),
            t(item.descriptionKey),
            t(SECTION_BY_ID[item.sectionId].titleKey),
            item.gestureInputKey ? t(item.gestureInputKey) : '',
            item.alternativeKey ? t(item.alternativeKey) : '',
            item.shortcutId ? commandShortcutHint(item.shortcutId) : ''
          ].join(' ')
        )
      })),
    [t]
  )

  const visibleItems = useMemo(() => {
    if (!isSearching) return ITEMS_BY_SECTION[activeSection]
    return localizedItemIndex.flatMap(({ item, searchText }) =>
      queryTokens.every((token) => searchText.includes(token)) ? [item] : []
    )
  }, [activeSection, isSearching, localizedItemIndex, queryTokens])

  const allShortcuts = useMemo<readonly HelpShortcut[]>(() => {
    const rendererShortcuts = RENDERER_SHORTCUT_MANIFEST.map((command) => {
      const label = t(RENDERER_SHORTCUT_LABEL_KEYS[command.id])
      const shortcut = formatCommandShortcut(command.shortcut)
      return {
        id: command.id,
        label,
        shortcut,
        available: true,
        searchText: normalizeCommandSearchText(`${label} ${shortcut}`)
      }
    })
    const appShortcuts = APP_COMMAND_MANIFEST.flatMap((command) => {
      const binding = 'shortcut' in command ? command.shortcut : undefined
      if (!binding) return []
      const required = 'requiredContext' in command ? command.requiredContext : undefined
      const label = t(commandTranslationKey(command.id), { defaultValue: command.label })
      const shortcut = formatCommandShortcut(binding)
      return [
        {
          id: command.id,
          label,
          shortcut,
          available: !required || context[required],
          searchText: normalizeCommandSearchText(`${label} ${shortcut}`)
        }
      ]
    })
    return [...rendererShortcuts, ...appShortcuts]
  }, [context, t])

  const visibleShortcuts = useMemo(() => {
    if (!isSearching) return allShortcuts
    return allShortcuts.filter((shortcut) =>
      queryTokens.every((token) => shortcut.searchText.includes(token))
    )
  }, [allShortcuts, isSearching, queryTokens])

  const activeSectionMeta = SECTION_BY_ID[activeSection]
  const ActiveSectionIcon = SECTION_ICONS[activeSection]
  const SectionHeadingIcon = isSearching ? Search : ActiveSectionIcon
  const activeSectionNumber = SECTION_NUMBER_BY_ID[activeSection]
  const resultCount = visibleItems.length + visibleShortcuts.length

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0
  }, [activeSection, normalizedQuery])

  const runAndClose = useCallback(
    (command: AppCommandId): void => {
      onClose()
      window.setTimeout(() => onRunCommand(command), 0)
    },
    [onClose, onRunCommand]
  )

  const handleNavigationKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, sectionIndex: number): void => {
      let nextIndex: number | null = null
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        nextIndex = (sectionIndex + 1) % LEARN_SECTIONS.length
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        nextIndex = (sectionIndex - 1 + LEARN_SECTIONS.length) % LEARN_SECTIONS.length
      } else if (event.key === 'Home') {
        nextIndex = 0
      } else if (event.key === 'End') {
        nextIndex = LEARN_SECTIONS.length - 1
      }
      if (nextIndex === null) return

      event.preventDefault()
      setQuery('')
      setActiveSection(LEARN_SECTIONS[nextIndex].id)
      const buttons =
        event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')
      buttons?.[nextIndex]?.focus()
    },
    []
  )

  const handleDialogKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (query) {
          setQuery('')
          searchRef.current?.focus()
        } else {
          onClose()
        }
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
        return
      }
      if (
        onBack &&
        ((event.altKey && event.key === 'ArrowLeft') || (event.metaKey && event.key === '['))
      ) {
        event.preventDefault()
        onBack()
        return
      }
      if (event.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    },
    [onBack, onClose, query]
  )

  return (
    <AppPageFrame
      ref={dialogRef}
      owner="help"
      titleId={titleId}
      className="help-center"
      onKeyDown={handleDialogKeyDown}
    >
      <header className="app-page-header help-header">
        <div className="app-page-title help-heading">
          {onBack && (
            <button
              type="button"
              className="app-page-back"
              aria-label={t('learning.backToSettings')}
              title={t('learning.backToSettings')}
              onClick={onBack}
            >
              <ArrowLeft size={ICON_SIZE.control} aria-hidden="true" />
            </button>
          )}
          <span className="help-brand-mark" aria-hidden="true">
            <CircleHelp size={ICON_SIZE.prominent} />
          </span>
          <div>
            <h1 id={titleId}>{t('learning.title')}</h1>
            <p>{t('learning.subtitle')}</p>
          </div>
        </div>

        <div className="help-search">
          <Search size={ICON_SIZE.control} aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('learning.searchPlaceholder')}
            aria-label={t('learning.searchLabel')}
          />
          {query && (
            <button
              type="button"
              className="help-search-clear"
              aria-label={t('learning.clearSearch')}
              onClick={() => {
                setQuery('')
                searchRef.current?.focus()
              }}
            >
              <X size={ICON_SIZE.compact} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="help-header-actions">
          <kbd aria-hidden="true">F1</kbd>
          <ModalCloseButton
            className="app-page-close"
            onClick={onClose}
            label={t('learning.close')}
          />
        </div>
      </header>

      <div className="help-layout">
        <nav className="help-navigation" aria-label={t('learning.navigationLabel')}>
          {LEARN_SECTIONS.map((section, sectionIndex) => {
            const Icon = SECTION_ICONS[section.id]
            return (
              <button
                type="button"
                key={section.id}
                className={activeSection === section.id && !isSearching ? 'active' : ''}
                aria-current={activeSection === section.id && !isSearching ? 'page' : undefined}
                onClick={() => {
                  setQuery('')
                  setActiveSection(section.id)
                }}
                onKeyDown={(event) => handleNavigationKeyDown(event, sectionIndex)}
              >
                <span className="help-nav-icon" aria-hidden="true">
                  <Icon size={ICON_SIZE.control} />
                </span>
                <span className="help-nav-label">{t(section.titleKey)}</span>
                <span className="help-nav-count" aria-hidden="true">
                  {section.id === 'tour'
                    ? TOUR_ITEMS.length
                    : section.id === 'shortcuts'
                      ? allShortcuts.length
                      : ITEMS_BY_SECTION[section.id].length}
                </span>
              </button>
            )
          })}
        </nav>

        <main ref={contentRef} className="help-content">
          <div className="help-content-inner">
            <div className="help-section-heading">
              <span className="help-section-icon" aria-hidden="true">
                <SectionHeadingIcon size={ICON_SIZE.prominent} />
              </span>
              <div>
                {!isSearching && (
                  <span className="help-section-index" aria-hidden="true">
                    {String(activeSectionNumber).padStart(2, '0')}
                  </span>
                )}
                <h2>{isSearching ? t('learning.searchResults') : t(activeSectionMeta.titleKey)}</h2>
                <p>
                  {isSearching
                    ? t('learning.searchResultsDescription', { query })
                    : t(activeSectionMeta.descriptionKey)}
                </p>
              </div>
              {isSearching && (
                <span className="help-results-count" aria-live="polite">
                  {t('learning.resultCount', { count: resultCount })}
                </span>
              )}
            </div>

            {isSearching ? (
              resultCount > 0 ? (
                <div className="help-search-groups">
                  {visibleItems.length > 0 && (
                    <div className="help-card-list">
                      {visibleItems.map((item) => (
                        <LearningCard
                          key={item.id}
                          item={item}
                          context={context}
                          showSectionLabel
                          onRunCommand={runAndClose}
                        />
                      ))}
                    </div>
                  )}
                  {visibleShortcuts.length > 0 && (
                    <section className="help-search-shortcuts">
                      <h3>
                        <Keyboard size={ICON_SIZE.compact} aria-hidden="true" />
                        {t('learning.sections.shortcuts.title')}
                      </h3>
                      <ShortcutList shortcuts={visibleShortcuts} />
                    </section>
                  )}
                </div>
              ) : (
                <div className="help-empty">
                  <span className="help-empty-icon" aria-hidden="true">
                    <Search size={ICON_SIZE.prominent} />
                  </span>
                  <div>
                    <strong>{t('learning.noResults')}</strong>
                    <p>{t('learning.searchResultsDescription', { query })}</p>
                  </div>
                  <button type="button" className="help-reset-button" onClick={() => setQuery('')}>
                    {t('learning.clearSearch')}
                  </button>
                </div>
              )
            ) : activeSection === 'tour' ? (
              <TourChecklist context={context} onRunCommand={runAndClose} />
            ) : activeSection === 'shortcuts' ? (
              <ShortcutList shortcuts={allShortcuts} />
            ) : visibleItems.length > 0 ? (
              <div className="help-card-list">
                {visibleItems.map((item) => (
                  <LearningCard
                    key={item.id}
                    item={item}
                    context={context}
                    showSectionLabel={false}
                    onRunCommand={runAndClose}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </AppPageFrame>
  )
})

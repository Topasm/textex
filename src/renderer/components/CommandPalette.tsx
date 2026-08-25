import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react'
import { CornerDownLeft, Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { APP_COMMAND_MANIFEST, type ShortcutBinding } from '../../shared/appCommandManifest'
import type { AppCommandId } from '../../shared/types'
import { getDesktopCapabilities, type DesktopCapabilities } from '../platform/capabilities'
import './CommandPalette.css'

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  onRunCommand: (command: AppCommandId) => void
  capabilities?: DesktopCapabilities
  context?: CommandPaletteContext
}

export interface CommandPaletteContext {
  document: boolean
  pdf: boolean
  project: boolean
}

interface PaletteCommand {
  command: (typeof APP_COMMAND_MANIFEST)[number]
  groupLabel: string
  label: string
  searchableText: string
  enabled: boolean
  unavailableLabel?: string
}

const DEFAULT_CONTEXT: CommandPaletteContext = Object.freeze({
  document: true,
  pdf: true,
  project: true
})

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim()
}

function commandTranslationKey(command: AppCommandId): string {
  return `commandPalette.commands.${command.replace(/\./g, '_')}`
}

export function formatCommandShortcut(
  binding: ShortcutBinding,
  isMac = document.documentElement.dataset.platform === 'darwin'
): string {
  const parts: string[] = []
  if (binding.mod) parts.push(isMac ? '⌘' : 'Ctrl')
  if (binding.alt) parts.push(isMac ? '⌥' : 'Alt')
  if (binding.shift) parts.push(isMac ? '⇧' : 'Shift')

  const key = Array.isArray(binding.key) ? binding.key[0] : binding.key
  parts.push(key.length === 1 ? key.toLocaleUpperCase() : key)
  return isMac ? parts.join('') : parts.join('+')
}

export function CommandPalette({
  isOpen,
  onClose,
  onRunCommand,
  capabilities = getDesktopCapabilities(),
  context = DEFAULT_CONTEXT
}: CommandPaletteProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()
  const hintId = useId()
  const listboxId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const commands = useMemo<PaletteCommand[]>(
    () =>
      APP_COMMAND_MANIFEST.filter((command) => {
        if (!('requiredCapability' in command)) return true
        return capabilities[command.requiredCapability]
      }).map((command) => {
        const label = t(commandTranslationKey(command.id), { defaultValue: command.label })
        const groupLabel = t(`commandPalette.groups.${command.group}`)
        const requiredContext = 'requiredContext' in command ? command.requiredContext : undefined
        const enabled = !requiredContext || context[requiredContext]
        const unavailableLabel = requiredContext
          ? t(`commandPalette.requires.${requiredContext}`)
          : undefined
        const searchableText = normalizeSearchText(
          [label, command.label, groupLabel, command.id, ...command.keywords].join(' ')
        )
        return { command, enabled, groupLabel, label, searchableText, unavailableLabel }
      }),
    [capabilities, context, t]
  )

  const filteredCommands = useMemo(() => {
    const searchTokens = normalizeSearchText(query).split(/\s+/).filter(Boolean)
    if (searchTokens.length === 0) return commands
    return commands.filter(({ searchableText }) =>
      searchTokens.every((token) => searchableText.includes(token))
    )
  }, [commands, query])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    if (!isOpen) return

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    setQuery('')
    setActiveIndex(0)
    inputRef.current?.focus()

    const handleDocumentKeyDown = (event: KeyboardEvent): void => {
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

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) {
        event.preventDefault()
        dialog.focus()
        return
      }

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

    document.addEventListener('keydown', handleDocumentKeyDown)
    return () => {
      document.removeEventListener('keydown', handleDocumentKeyDown)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [isOpen])

  useEffect(() => {
    if (activeIndex < filteredCommands.length) return
    setActiveIndex(Math.max(0, filteredCommands.length - 1))
  }, [activeIndex, filteredCommands.length])

  useEffect(() => {
    if (!isOpen || !filteredCommands[activeIndex]) return
    const option = document.getElementById(`${listboxId}-option-${activeIndex}`)
    if (option && typeof option.scrollIntoView === 'function') {
      option.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex, filteredCommands, isOpen, listboxId])

  if (!isOpen) return null

  const activeOptionId = filteredCommands[activeIndex]
    ? `${listboxId}-option-${activeIndex}`
    : undefined

  const execute = (entry: PaletteCommand): void => {
    if (!entry.enabled) return
    onClose()
    onRunCommand(entry.command.id)
  }

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (filteredCommands.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % filteredCommands.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => (index - 1 + filteredCommands.length) % filteredCommands.length)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActiveIndex(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActiveIndex(filteredCommands.length - 1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const selected = filteredCommands[activeIndex]
      if (selected) execute(selected)
    }
  }

  return (
    <div
      className="command-palette-overlay"
      role="presentation"
      data-app-overlay-owner="commandPalette"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={hintId}
        tabIndex={-1}
      >
        <div className="command-palette-header">
          <h2 id={titleId}>{t('commandPalette.title')}</h2>
          <button
            type="button"
            className="command-palette-close"
            onClick={onClose}
            aria-label={t('commandPalette.close')}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="command-palette-search">
          <Search size={17} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls={listboxId}
            aria-activedescendant={activeOptionId}
            aria-label={t('commandPalette.searchLabel')}
            placeholder={t('commandPalette.placeholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
            autoComplete="off"
            spellCheck="false"
          />
        </div>

        <div className="command-palette-results">
          <ul
            id={listboxId}
            className="command-palette-list"
            role="listbox"
            aria-label={t('commandPalette.resultsLabel')}
          >
            {filteredCommands.map((entry, index) => {
              const previous = filteredCommands[index - 1]
              const showGroup = !previous || previous.command.group !== entry.command.group
              const shortcut =
                'shortcut' in entry.command
                  ? formatCommandShortcut(entry.command.shortcut)
                  : undefined
              const optionId = `${listboxId}-option-${index}`
              const unavailableId = `${optionId}-unavailable`

              return (
                <Fragment key={entry.command.id}>
                  {showGroup && (
                    <li className="command-palette-group" role="presentation">
                      {entry.groupLabel}
                    </li>
                  )}
                  <li
                    id={optionId}
                    className={`command-palette-option${activeIndex === index ? ' active' : ''}${entry.enabled ? '' : ' disabled'}`}
                    role="option"
                    aria-label={entry.label}
                    aria-selected={activeIndex === index}
                    aria-disabled={!entry.enabled}
                    aria-describedby={entry.enabled ? undefined : unavailableId}
                    onMouseMove={() => setActiveIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => execute(entry)}
                  >
                    <span className="command-palette-option-label">{entry.label}</span>
                    <span className="command-palette-option-meta">
                      {!entry.enabled && entry.unavailableLabel && (
                        <span id={unavailableId} className="command-palette-unavailable">
                          {entry.unavailableLabel}
                        </span>
                      )}
                      {shortcut && <kbd aria-hidden="true">{shortcut}</kbd>}
                    </span>
                  </li>
                </Fragment>
              )
            })}
          </ul>
          {filteredCommands.length === 0 && (
            <p className="command-palette-empty" role="status">
              {t('commandPalette.noResults')}
            </p>
          )}
        </div>

        <p id={hintId} className="command-palette-hint">
          <CornerDownLeft size={13} aria-hidden="true" />
          {t('commandPalette.hint')}
        </p>
      </div>
    </div>
  )
}

import type { TFunction } from 'i18next'
import {
  APP_COMMAND_MANIFEST,
  RENDERER_SHORTCUT_MANIFEST,
  type ShortcutBinding
} from '../../shared/appCommandManifest'
import type { AppCommandId } from '../../shared/types'

export interface CommandAvailabilityContext {
  document: boolean
  pdf: boolean
  project: boolean
}

export interface CommandSearchEntry {
  command: (typeof APP_COMMAND_MANIFEST)[number]
  groupLabel: string
  label: string
  searchableText: string
  normalizedLabel: string
  enabled: boolean
  unavailableLabel?: string
  manifestIndex: number
}

const DEFAULT_CONTEXT: CommandAvailabilityContext = Object.freeze({
  document: true,
  pdf: true,
  project: true
})

export function normalizeCommandSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim()
}

export function commandTranslationKey(command: AppCommandId): string {
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

/**
 * The shortcut bound to a command, formatted for the current platform.
 *
 * Shortcuts were only ever visible inside the command palette, so a control
 * the author uses every day never taught its own accelerator. Chrome can now
 * append the hint to its tooltip.
 */
export function commandShortcutHint(id: string): string | null {
  const appCommand = APP_COMMAND_MANIFEST.find((command) => command.id === id)
  const binding: ShortcutBinding | undefined =
    appCommand && 'shortcut' in appCommand
      ? appCommand.shortcut
      : RENDERER_SHORTCUT_MANIFEST.find((command) => command.id === id)?.shortcut
  return binding ? formatCommandShortcut(binding) : null
}

/** `Save (Ctrl+S)` — the label alone when the command has no binding. */
export function withShortcutHint(label: string, id: string): string {
  const hint = commandShortcutHint(id)
  return hint ? `${label} (${hint})` : label
}

export function createCommandSearchEntries(
  t: TFunction,
  context: CommandAvailabilityContext = DEFAULT_CONTEXT
): CommandSearchEntry[] {
  return APP_COMMAND_MANIFEST.map((command, manifestIndex) => {
    const label = String(t(commandTranslationKey(command.id), { defaultValue: command.label }))
    const groupLabel = String(t(`commandPalette.groups.${command.group}`))
    const requiredContext = 'requiredContext' in command ? command.requiredContext : undefined
    const enabled = !requiredContext || context[requiredContext]
    const unavailableLabel = requiredContext
      ? String(t(`commandPalette.requires.${requiredContext}`))
      : undefined
    const normalizedLabel = normalizeCommandSearchText(label)
    const searchableText = normalizeCommandSearchText(
      [label, command.label, groupLabel, command.id, ...command.keywords].join(' ')
    )

    return {
      command,
      enabled,
      groupLabel,
      label,
      searchableText,
      normalizedLabel,
      unavailableLabel,
      manifestIndex
    }
  })
}

function commandMatchScore(entry: CommandSearchEntry, query: string, tokens: string[]): number {
  if (entry.normalizedLabel === query) return 0
  if (entry.normalizedLabel.startsWith(query)) return 10

  const normalizedId = normalizeCommandSearchText(entry.command.id)
  if (normalizedId === query) return 15
  if (normalizedId.startsWith(query)) return 20

  if (tokens.every((token) => entry.normalizedLabel.includes(token))) return 30
  return 40
}

/** Search the shared command catalog. A leading `>` is accepted for command queries. */
export function searchCommandEntries(
  entries: readonly CommandSearchEntry[],
  rawQuery: string
): CommandSearchEntry[] {
  const query = normalizeCommandSearchText(rawQuery.replace(/^\s*>\s?/, ''))
  if (!query) return [...entries]

  const tokens = query.split(/\s+/).filter(Boolean)
  return entries
    .filter(({ searchableText }) => tokens.every((token) => searchableText.includes(token)))
    .sort((left, right) => {
      const scoreDifference =
        commandMatchScore(left, query, tokens) - commandMatchScore(right, query, tokens)
      return scoreDifference || left.manifestIndex - right.manifestIndex
    })
}

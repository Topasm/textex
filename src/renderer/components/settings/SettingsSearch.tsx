import { createContext, useContext, useMemo, type ReactNode } from 'react'

/**
 * Row-level settings search.
 *
 * The settings page used to filter whole tabs by their translated copy, which
 * told the author which tab held a match but not which row. These helpers let
 * every section, row, and custom control group decide for itself whether it
 * matches the active query, and mark the matching words.
 */

export interface SettingsSearchState {
  /** The query as typed. */
  query: string
  /** Folded, whitespace-split terms; every term has to match. */
  tokens: readonly string[]
}

interface SettingsSectionScope {
  /**
   * Set while the enclosing section (or custom block) matched as a whole, so
   * its rows stay visible even when they do not match on their own.
   */
  forceVisible: boolean
}

const EMPTY_SEARCH: SettingsSearchState = Object.freeze({ query: '', tokens: [] })
const SettingsSearchContext = createContext<SettingsSearchState>(EMPTY_SEARCH)
const SettingsSectionScopeContext = createContext<SettingsSectionScope>({ forceVisible: false })

/**
 * Case- and diacritic-insensitive fold. Unlike the command palette helper it
 * does not trim, so folding one character at a time keeps offsets aligned with
 * the original text for highlighting.
 */
export function foldSettingsSearchText(value: string): string {
  return value.normalize('NFKD').replace(/[̀-ͯ]/gu, '').toLocaleLowerCase()
}

export function tokenizeSettingsSearch(query: string): string[] {
  return foldSettingsSearchText(query).split(/\s+/u).filter(Boolean)
}

/** Every string inside a translation subtree, array, or loose list of copy. */
export function collectSettingsCopy(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (!value || typeof value !== 'object') return []
  // React elements carry props trees; they are rendered, not searched.
  if ('$$typeof' in value) return []
  return Object.values(value).flatMap(collectSettingsCopy)
}

export function settingsSearchMatches(
  tokens: readonly string[],
  ...copy: readonly unknown[]
): boolean {
  if (tokens.length === 0) return true
  const haystack = foldSettingsSearchText(collectSettingsCopy(copy).join(' '))
  return tokens.every((token) => haystack.includes(token))
}

export function SettingsSearchProvider({
  query,
  children
}: {
  query: string
  children: ReactNode
}) {
  const value = useMemo<SettingsSearchState>(
    () => ({ query, tokens: tokenizeSettingsSearch(query) }),
    [query]
  )
  return <SettingsSearchContext.Provider value={value}>{children}</SettingsSearchContext.Provider>
}

export function useSettingsSearch(): SettingsSearchState {
  return useContext(SettingsSearchContext)
}

export function useSettingsSectionScope(): SettingsSectionScope {
  return useContext(SettingsSectionScopeContext)
}

export const SettingsSectionScopeProvider = SettingsSectionScopeContext.Provider

/**
 * Half-open `[start, end)` code-unit ranges of `text` that any token matches,
 * merged so overlapping terms produce one highlight. Matching happens on the
 * folded text, so `editeur` highlights `Éditeur`, and the ranges map back to
 * the original string even where folding changes the length (ligatures).
 */
export function highlightRanges(text: string, tokens: readonly string[]): Array<[number, number]> {
  let folded = ''
  const originStart: number[] = []
  const originEnd: number[] = []
  let offset = 0
  for (const char of text) {
    const foldedChar = foldSettingsSearchText(char)
    for (let index = 0; index < foldedChar.length; index += 1) {
      originStart.push(offset)
      originEnd.push(offset + char.length)
    }
    folded += foldedChar
    offset += char.length
  }

  const ranges: Array<[number, number]> = []
  for (const token of tokens) {
    if (!token) continue
    let from = 0
    for (;;) {
      const at = folded.indexOf(token, from)
      if (at === -1) break
      ranges.push([originStart[at], originEnd[at + token.length - 1]])
      from = at + token.length
    }
  }
  ranges.sort((left, right) => left[0] - right[0] || left[1] - right[1])

  const merged: Array<[number, number]> = []
  for (const [start, end] of ranges) {
    const last = merged.at(-1)
    if (last && start <= last[1]) last[1] = Math.max(last[1], end)
    else merged.push([start, end])
  }
  return merged
}

/** Plain text with the active search terms wrapped in `<mark>`. */
export function SettingsHighlight({ text }: { text: string }) {
  const { tokens } = useSettingsSearch()
  if (tokens.length === 0) return <>{text}</>
  const ranges = highlightRanges(text, tokens)
  if (ranges.length === 0) return <>{text}</>

  const parts: ReactNode[] = []
  let cursor = 0
  ranges.forEach(([start, end], index) => {
    if (start > cursor) parts.push(text.slice(cursor, start))
    parts.push(
      <mark key={index} className="settings-search-match">
        {text.slice(start, end)}
      </mark>
    )
    cursor = end
  })
  if (cursor < text.length) parts.push(text.slice(cursor))
  return <>{parts}</>
}

interface SettingsSearchBlockProps {
  /** Copy the block answers to: labels, option names, help text. */
  keywords: readonly unknown[]
  children: ReactNode
}

/**
 * Keeps a custom control group (a theme grid, a slider, an AI connection
 * panel) in the row-level search. It renders nothing while a query is active
 * that none of its copy matches, and everything inside it stays visible once
 * it does match.
 */
export function SettingsSearchBlock({ keywords, children }: SettingsSearchBlockProps) {
  const { tokens } = useSettingsSearch()
  const { forceVisible } = useSettingsSectionScope()
  const scope = useMemo<SettingsSectionScope>(() => ({ forceVisible: true }), [])
  if (!forceVisible && !settingsSearchMatches(tokens, keywords)) return null
  return (
    <SettingsSectionScopeContext.Provider value={scope}>
      {children}
    </SettingsSectionScopeContext.Provider>
  )
}

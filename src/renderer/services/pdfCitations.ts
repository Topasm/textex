import type { AuxCitationMap } from '../../shared/auxparser'
import type { BibEntry } from '../../shared/types'

/** hyperref uses cite.KEY; biblatex adds the reference section as cite.0@KEY. */
export function citationKeyFromDestination(destination: unknown): string | null {
  if (typeof destination !== 'string') return null
  let decoded = destination
  try {
    decoded = decodeURIComponent(destination)
  } catch {
    // A literal percent sign is legal in a PDF named destination.
  }
  return /^#?cite\.(?:\d+@)?(.+)$/u.exec(decoded)?.[1] ?? null
}

export function resolvePdfCitation(destination: unknown, entries: BibEntry[]): BibEntry[] | null {
  const key = citationKeyFromDestination(destination)
  if (!key) return null
  // A known citation still opens in place when its .bib entry is unavailable.
  return [
    entries.find((entry) => entry.key === key) ?? {
      key,
      type: '',
      title: '',
      author: '',
      year: ''
    }
  ]
}

/** Exact numeric citation spans only; ordinary prose and equation labels are untouched. */
export function resolvePdfCitationLabel(
  text: string,
  entries: BibEntry[],
  labels: AuxCitationMap | null
): BibEntry[] | null {
  if (text.length > 256) return null
  const match = /^\[(\d+(?:\s*[–-]\s*\d+)?(?:\s*,\s*\d+(?:\s*[–-]\s*\d+)?)*)\]$/u.exec(text.trim())
  if (!match || !labels) return null
  const keys = new Set<string>()
  for (const part of match[1].split(',')) {
    const [first, last = first] = part.trim().split(/[–-]/u).map(Number)
    if (
      !Number.isSafeInteger(first) ||
      !Number.isSafeInteger(last) ||
      last < first ||
      last - first > 100
    )
      return null
    for (let label = first; label <= last; label++) {
      for (const key of labels.labelToKeys.get(String(label)) ?? []) keys.add(key)
    }
  }
  const found = [...keys].flatMap((key) => entries.find((entry) => entry.key === key) ?? [])
  return found.length ? found : null
}

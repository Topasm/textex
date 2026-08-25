import type { CitationLocation, CitationUsage } from '../../shared/types'

const CITATION_PATTERN =
  /\\(?:cite|citep|citet|citealt|citealp|citeauthor|citeyear|citeyearpar|parencite|textcite|smartcite|autocite|footcite|supercite)\*?(?:\s*\[[^\]]*\]){0,2}\s*\{([^}]*)\}/gu
const MAX_CITATION_LOCATIONS_PER_KEY = 20

function stripLatexComment(line: string): string {
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] !== '%') continue
    let backslashes = 0
    for (let cursor = index - 1; cursor >= 0 && line[cursor] === '\\'; cursor -= 1) {
      backslashes += 1
    }
    if (backslashes % 2 === 0) return line.slice(0, index)
  }
  return line
}

export function parseCitationUsages(content: string, filePath?: string): CitationUsage[] {
  const uncommented = content.split(/\r?\n/gu).map(stripLatexComment).join('\n')
  const usages = new Map<string, { count: number; locations: CitationLocation[] }>()
  const lineStarts = [0]
  for (let index = 0; index < uncommented.length; index += 1) {
    if (uncommented[index] === '\n') lineStarts.push(index + 1)
  }
  for (const match of uncommented.matchAll(CITATION_PATTERN)) {
    const line = sourceLineAt(lineStarts, match.index)
    for (const rawKey of (match[1] ?? '').split(',')) {
      const citekey = rawKey.trim()
      if (!citekey || citekey === '*' || /[\p{Cc}\p{Cf}]/u.test(citekey)) continue
      const usage = usages.get(citekey) ?? { count: 0, locations: [] }
      usage.count += 1
      if (filePath && usage.locations.length < MAX_CITATION_LOCATIONS_PER_KEY) {
        usage.locations.push({ file: filePath, line })
      }
      usages.set(citekey, usage)
    }
  }
  return [...usages]
    .map(([citekey, usage]) => ({
      citekey,
      count: usage.count,
      ...(usage.locations.length > 0 ? { locations: usage.locations } : {})
    }))
    .sort((left, right) => left.citekey.localeCompare(right.citekey))
}

function sourceLineAt(lineStarts: number[], offset: number): number {
  let low = 0
  let high = lineStarts.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (lineStarts[middle] <= offset) low = middle + 1
    else high = middle
  }
  return Math.max(1, low)
}

function sameFile(left: string, right: string): boolean {
  const normalizedLeft = left.replace(/\\/gu, '/')
  const normalizedRight = right.replace(/\\/gu, '/')
  if (/^[a-z]:\//iu.test(normalizedLeft) || /^[a-z]:\//iu.test(normalizedRight)) {
    return normalizedLeft.toLocaleLowerCase('en-US') === normalizedRight.toLocaleLowerCase('en-US')
  }
  return normalizedLeft === normalizedRight
}

export function overlayCitationUsages(
  base: CitationUsage[],
  overlays: Array<{ filePath?: string; savedText: string; currentText: string }>
): CitationUsage[] {
  const usages = new Map(
    base.map((usage) => [
      usage.citekey,
      { count: usage.count, locations: [...(usage.locations ?? [])] }
    ])
  )
  for (const overlay of overlays) {
    if (overlay.filePath) {
      for (const usage of usages.values()) {
        usage.locations = usage.locations.filter(
          (location) => !sameFile(location.file, overlay.filePath as string)
        )
      }
    }
    for (const usage of parseCitationUsages(overlay.savedText)) {
      const current = usages.get(usage.citekey) ?? { count: 0, locations: [] }
      current.count = Math.max(0, current.count - usage.count)
      usages.set(usage.citekey, current)
    }
    for (const usage of parseCitationUsages(overlay.currentText, overlay.filePath)) {
      const current = usages.get(usage.citekey) ?? { count: 0, locations: [] }
      current.count += usage.count
      const remaining = MAX_CITATION_LOCATIONS_PER_KEY - current.locations.length
      if (remaining > 0) current.locations.push(...(usage.locations ?? []).slice(0, remaining))
      usages.set(usage.citekey, current)
    }
  }
  return [...usages]
    .filter(([, usage]) => usage.count > 0)
    .map(([citekey, usage]) => ({
      citekey,
      count: usage.count,
      ...(usage.locations.length > 0
        ? {
            locations: usage.locations.sort(
              (left, right) => left.file.localeCompare(right.file) || left.line - right.line
            )
          }
        : {})
    }))
    .sort((left, right) => left.citekey.localeCompare(right.citekey))
}

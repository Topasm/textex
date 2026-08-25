import type { CitationUsage } from '../../shared/types'

const CITATION_PATTERN =
  /\\(?:cite|citep|citet|citealt|citealp|citeauthor|citeyear|citeyearpar|parencite|textcite|smartcite|autocite|footcite|supercite)\*?(?:\s*\[[^\]]*\]){0,2}\s*\{([^}]*)\}/gu

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

export function parseCitationUsages(content: string): CitationUsage[] {
  const uncommented = content.split(/\r?\n/gu).map(stripLatexComment).join('\n')
  const counts = new Map<string, number>()
  for (const match of uncommented.matchAll(CITATION_PATTERN)) {
    for (const rawKey of (match[1] ?? '').split(',')) {
      const citekey = rawKey.trim()
      if (!citekey || citekey === '*' || /[\p{Cc}\p{Cf}]/u.test(citekey)) continue
      counts.set(citekey, (counts.get(citekey) ?? 0) + 1)
    }
  }
  return [...counts]
    .map(([citekey, count]) => ({ citekey, count }))
    .sort((left, right) => left.citekey.localeCompare(right.citekey))
}

export function overlayCitationUsages(
  base: CitationUsage[],
  overlays: Array<{ savedText: string; currentText: string }>
): CitationUsage[] {
  const counts = new Map(base.map((usage) => [usage.citekey, usage.count]))
  for (const overlay of overlays) {
    for (const usage of parseCitationUsages(overlay.savedText)) {
      counts.set(usage.citekey, Math.max(0, (counts.get(usage.citekey) ?? 0) - usage.count))
    }
    for (const usage of parseCitationUsages(overlay.currentText)) {
      counts.set(usage.citekey, (counts.get(usage.citekey) ?? 0) + usage.count)
    }
  }
  return [...counts]
    .filter(([, count]) => count > 0)
    .map(([citekey, count]) => ({ citekey, count }))
    .sort((left, right) => left.citekey.localeCompare(right.citekey))
}

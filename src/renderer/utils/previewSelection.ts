import type { EditorRange } from '../editor/EditorAdapter'

/** Match PDF whitespace and ligatures while retaining offsets into the source. */
export function findPreviewText(
  text: string,
  selected: string
): { start: number; end: number } | null {
  const offsets: number[] = []
  let normalized = ''
  for (let index = 0; index < text.length; index++) {
    for (const character of text[index].normalize('NFKC')) {
      const next = /\s/u.test(character) ? ' ' : character
      if (next === ' ' && normalized.endsWith(' ')) continue
      normalized += next
      offsets.push(index)
    }
  }
  const query = selected.normalize('NFKC').replace(/\s+/gu, ' ').trim()
  if (!query) return null
  const start = normalized.indexOf(query)
  if (start < 0 || normalized.indexOf(query, start + 1) >= 0) return null
  return { start: offsets[start], end: offsets[start + query.length - 1] + 1 }
}

/** SyncTeX locates lines; literal text refines them when the match is unambiguous. */
export function previewSourceRange(
  source: string,
  selected: string,
  firstLine: number,
  lastLine: number
): EditorRange | null {
  const lines = source.split('\n')
  const startLine = Math.min(firstLine, lastLine)
  const endLine = Math.max(firstLine, lastLine)
  if (
    !Number.isSafeInteger(startLine) ||
    !Number.isSafeInteger(endLine) ||
    startLine < 1 ||
    endLine > lines.length
  )
    return null
  const passage = lines.slice(startLine - 1, endLine).join('\n')
  const match = findPreviewText(passage, selected)
  const position = (offset: number) => {
    const preceding = passage.slice(0, offset).split('\n')
    return { line: startLine + preceding.length - 1, column: preceding.at(-1)!.length + 1 }
  }
  return match
    ? { start: position(match.start), end: position(match.end) }
    : {
        start: { line: startLine, column: 1 },
        end: { line: endLine, column: lines[endLine - 1].length + 1 }
      }
}

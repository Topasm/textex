import type { EditorRange } from '../editor/EditorAdapter'
import { transparentFormattingAt } from './sentenceSelection'

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
  let match = findPreviewText(passage, selected)
  if (!match && selected) {
    // Common text-formatting commands are transparent in PDF text. Retain a
    // source-offset map so a sentence inside a longer TeX line stays precise.
    // Each plain character maps back to the source span that printed it.
    const starts: number[] = []
    const ends: number[] = []
    let plain = ''
    for (let index = 0; index < passage.length; index++) {
      const command = transparentFormattingAt(passage, index)
      if (command) {
        index += command - 1
        continue
      }
      // Escaped specials print as the character itself, like sentenceSearchText.
      if (passage[index] === '\\' && /[%&#_{}]/u.test(passage[index + 1] ?? '')) {
        plain += passage[index + 1]
        starts.push(index)
        ends.push(index + 2)
        index++
        continue
      }
      if (passage[index] === '{' || passage[index] === '}') continue
      plain += passage[index] === '~' ? ' ' : passage[index]
      starts.push(index)
      ends.push(index + 1)
    }
    const found = findPreviewText(plain, selected)
    if (found) match = { start: starts[found.start], end: ends[found.end - 1] }
  }
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

import type { EditorPosition, EditorRange } from '../editor/EditorAdapter'

const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' })

/** Offsets stay in UTF-16, matching both DOM ranges and Monaco columns. */
export function sentenceAt(text: string, offset: number): { start: number; end: number } | null {
  if (!text.trim() || offset < 0 || offset > text.length) return null
  // A PDF/source line wrap is not a sentence boundary. Keep the same offsets.
  for (const part of segmenter.segment(text.replace(/[\r\n]/gu, ' '))) {
    const end = part.index + part.segment.length
    if (offset >= end && end !== text.length) continue
    const start = part.index + part.segment.length - part.segment.trimStart().length
    const trimmedEnd = end - (part.segment.length - part.segment.trimEnd().length)
    return trimmedEnd > start ? { start, end: trimmedEnd } : null
  }
  return null
}

const isBoundary = (line: string) =>
  !line.trim() || /^\s*(?:%|\\(?:begin|end|(?:sub)*section|chapter|part|item)\b)/u.test(line)

/** Index of the first unescaped `%`, or -1 when the line has no comment. */
function commentStart(line: string): number {
  for (let index = 0; index < line.length; index++) {
    if (line[index] === '\\') index++
    else if (line[index] === '%') return index
  }
  return -1
}

/** Blank out trailing comments while keeping offsets aligned with the source. */
function maskComment(line: string): string {
  const start = commentStart(line)
  return start < 0 ? line : line.slice(0, start) + ' '.repeat(line.length - start)
}

export function sourceSentenceAt(
  source: string,
  position: EditorPosition
): {
  range: EditorRange
  text: string
} | null {
  const lines = source.split('\n')
  const line = position.line - 1
  if (
    !lines[line] ||
    isBoundary(lines[line]) ||
    position.column < 1 ||
    position.column > lines[line].length + 1
  )
    return null
  const comment = commentStart(lines[line])
  if (comment >= 0 && position.column - 1 >= comment) return null
  let first = line
  let last = line
  while (first > 0 && !isBoundary(lines[first - 1])) first--
  while (last + 1 < lines.length && !isBoundary(lines[last + 1])) last++
  const paragraph = lines.slice(first, last + 1).join('\n')
  const offset =
    lines.slice(first, line).reduce((sum, value) => sum + value.length + 1, 0) + position.column - 1
  const searchable = lines
    .slice(first, last + 1)
    .map(maskComment)
    .join('\n')
  const sentence = sentenceAt(searchable, offset)
  if (!sentence) return null
  const text = paragraph.slice(sentence.start, sentence.end)
  // Replacing a sentence that spans a comment would silently drop the comment.
  if (text !== searchable.slice(sentence.start, sentence.end)) return null
  const point = (at: number): EditorPosition => {
    const preceding = paragraph.slice(0, at).split('\n')
    return { line: first + preceding.length, column: preceding.at(-1)!.length + 1 }
  }
  return {
    range: { start: point(sentence.start), end: point(sentence.end) },
    text
  }
}

/** Formatting commands whose argument appears verbatim in PDF text. */
const TRANSPARENT_FORMATTING = /\\(?:textbf|textit|emph|texttt|textrm|textsf|textnormal)\s*\{/u
const TRANSPARENT_FORMATTING_ALL = new RegExp(TRANSPARENT_FORMATTING.source, 'gu')
const TRANSPARENT_FORMATTING_AT = new RegExp(TRANSPARENT_FORMATTING.source, 'uy')

/** Length of the transparent formatting command starting at `index`, or 0. */
export function transparentFormattingAt(text: string, index: number): number {
  TRANSPARENT_FORMATTING_AT.lastIndex = index
  return TRANSPARENT_FORMATTING_AT.exec(text)?.[0].length ?? 0
}

/** Only transparent text formatting is removed; unknown macros keep the line fallback. */
export function sentenceSearchText(source: string): string {
  return source
    .replace(TRANSPARENT_FORMATTING_ALL, '{')
    .replace(/(?<!\\)[{}]/gu, '')
    .replace(/\\([%&#_{}])/gu, '$1')
    .replace(/~/gu, ' ')
}

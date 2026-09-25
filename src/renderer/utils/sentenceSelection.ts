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
  let first = line
  let last = line
  while (first > 0 && !isBoundary(lines[first - 1])) first--
  while (last + 1 < lines.length && !isBoundary(lines[last + 1])) last++
  const paragraph = lines.slice(first, last + 1).join('\n')
  const offset =
    lines.slice(first, line).reduce((sum, value) => sum + value.length + 1, 0) + position.column - 1
  const sentence = sentenceAt(paragraph, offset)
  if (!sentence) return null
  const point = (at: number): EditorPosition => {
    const preceding = paragraph.slice(0, at).split('\n')
    return { line: first + preceding.length, column: preceding.at(-1)!.length + 1 }
  }
  return {
    range: { start: point(sentence.start), end: point(sentence.end) },
    text: paragraph.slice(sentence.start, sentence.end)
  }
}

/** Only transparent text formatting is removed; unknown macros keep the line fallback. */
export function sentenceSearchText(source: string): string {
  return source
    .replace(/\\(?:textbf|textit|emph|texttt|textrm|textsf|textnormal)\s*\{/gu, '{')
    .replace(/(?<!\\)[{}]/gu, '')
    .replace(/\\([%&#_{}])/gu, '$1')
    .replace(/~/gu, ' ')
}

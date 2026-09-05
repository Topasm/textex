import { commonLines } from './lineMatches'
import { markdownProseToLatex } from './proseInline'
import { isEditableProseBlock, type ProseBlock, type ProseDocument } from './proseProjection'

export interface ProseSourceEdit {
  /** 1-based line, 1-based column, end exclusive — the editor's convention. */
  range: {
    start: { line: number; column: number }
    end: { line: number; column: number }
  }
  text: string
}

/**
 * The whole document as one editable Markdown text, and the way back.
 *
 * The prose view shows a continuous Markdown source rather than a field per
 * block, so the author writes the way they would in any editor. Safety still
 * comes from the blocks underneath: every Markdown line remembers which block
 * produced it, an edit is attributed back through a line diff, and only the
 * blocks whose text actually changed are rewritten. Whatever the author did not
 * touch is never re-serialized.
 *
 * Structural edits the projection cannot express — retitling by hand-editing a
 * protected block, reordering sections — are refused with a reason instead of
 * being guessed at.
 */

export interface ProseSpan {
  block: ProseBlock
  /** 1-based inclusive line range inside the Markdown text. */
  startLine: number
  endLine: number
}

export interface ProseDocumentText {
  markdown: string
  spans: ProseSpan[]
}

export type ProseWriteBack =
  | { status: 'ok'; edits: ProseSourceEdit[] }
  | { status: 'unchanged' }
  | { status: 'refused'; reason: ProseRefusal }

export type ProseRefusal = 'protectedChanged' | 'structureChanged'

/** Blocks the author sees. Preamble, labels and comments stay out of view. */
function isVisible(block: ProseBlock): boolean {
  return block.kind === 'heading' || block.kind === 'prose' || block.kind === 'protected'
}

export function proseDocumentText(document: ProseDocument): ProseDocumentText {
  const spans: ProseSpan[] = []
  const lines: string[] = []

  for (const block of document.blocks) {
    if (!isVisible(block)) continue
    if (lines.length > 0) lines.push('')
    const body = (block.kind === 'protected' ? block.source : block.markdown).split('\n')
    const startLine = lines.length + 1
    lines.push(...body)
    spans.push({ block, startLine, endLine: lines.length })
  }

  return { markdown: lines.join('\n'), spans }
}

/**
 * Attributes every edited line back to the span it came from.
 *
 * Walks the two line sequences together along the common subsequence. A line
 * that survived belongs to whichever span owned it; a line the author inserted
 * joins the span that owns the text just above it, which is where a new
 * sentence in a paragraph lands. Every edited line is claimed exactly once, so
 * no text can be silently dropped or duplicated into a neighbour.
 */
function attribute(
  spans: readonly ProseSpan[],
  originalLines: readonly string[],
  editedLines: readonly string[]
): string[] {
  // Blank separators between spans belong to no block.
  const owner = new Array<number | null>(originalLines.length).fill(null)
  for (const [index, span] of spans.entries()) {
    for (let line = span.startLine - 1; line <= span.endLine - 1; line += 1) owner[line] = index
  }

  const claimed: string[][] = spans.map(() => [])
  let lastOwner = 0

  const ownerAt = (originalIndex: number): number => {
    for (let cursor = originalIndex; cursor >= 0; cursor -= 1) {
      const found = owner[cursor]
      if (found !== null) return found
    }
    return 0
  }

  let originalIndex = 0
  let editedIndex = 0
  for (const [matchedOriginal, matchedEdited] of commonLines(originalLines, editedLines)) {
    // Lines typed here either replace original lines that were removed — in
    // which case they belong to whoever owned those — or are a pure insertion,
    // which joins the span above.
    const replaced = originalIndex < matchedOriginal
    const insertOwner = ownerAt(replaced ? originalIndex : Math.max(0, matchedOriginal - 1))
    for (; editedIndex < matchedEdited; editedIndex += 1) {
      claimed[insertOwner].push(editedLines[editedIndex])
    }

    const lineOwner = owner[matchedOriginal]
    if (lineOwner !== null) {
      claimed[lineOwner].push(editedLines[matchedEdited])
      lastOwner = lineOwner
    }
    originalIndex = matchedOriginal + 1
    editedIndex = matchedEdited + 1
  }

  // Trailing text replaces whatever the document used to end with, so it goes
  // to the span that owned the last original line — not the last matched one,
  // which would hand a rewritten final paragraph to the heading above it.
  const tailOwner = originalLines.length > 0 ? ownerAt(originalLines.length - 1) : lastOwner
  for (; editedIndex < editedLines.length; editedIndex += 1) {
    claimed[tailOwner].push(editedLines[editedIndex])
  }

  // A span whose lines were all replaced keeps the blank separators out.
  return claimed.map((lines) => trimBlankEdges(lines).join('\n'))
}

function trimBlankEdges(lines: readonly string[]): string[] {
  let start = 0
  let end = lines.length
  while (start < end && lines[start].trim() === '') start += 1
  while (end > start && lines[end - 1].trim() === '') end -= 1
  return lines.slice(start, end)
}

const HEADING_PREFIX = /^\s*#{1,6}\s*/u

function lastColumn(source: string): number {
  const lines = source.split('\n')
  return lines[lines.length - 1].length + 1
}

/** Source edits for an edited Markdown document, or the reason to refuse. */
export function proseDocumentEdits(
  document: ProseDocumentText,
  editedMarkdown: string
): ProseWriteBack {
  if (editedMarkdown === document.markdown) return { status: 'unchanged' }

  const originalLines = document.markdown.split('\n')
  const editedLines = editedMarkdown.split('\n')
  const claimed = attribute(document.spans, originalLines, editedLines)

  const edits: ProseSourceEdit[] = []
  for (const [index, span] of document.spans.entries()) {
    const { block } = span
    const before = block.kind === 'protected' ? block.source : block.markdown
    const after = claimed[index] ?? before
    if (after === before) continue

    // A protected block holds LaTeX the projection cannot re-derive.
    if (block.kind === 'protected') return { status: 'refused', reason: 'protectedChanged' }

    if (block.kind === 'heading') {
      const range = block.titleRange
      // A heading that lost its `##`, or one whose title spans lines, is a
      // structural change this view will not attempt.
      if (!range || !HEADING_PREFIX.test(after) || after.includes('\n')) {
        return { status: 'refused', reason: 'structureChanged' }
      }
      const title = markdownProseToLatex(after.replace(HEADING_PREFIX, '').trim())
      if (title === block.title) continue
      edits.push({
        range: {
          start: { line: range.line, column: range.startColumn },
          end: { line: range.line, column: range.endColumn }
        },
        text: title
      })
      continue
    }

    if (!isEditableProseBlock(block)) return { status: 'refused', reason: 'structureChanged' }

    edits.push({
      range: {
        start: { line: block.startLine, column: 1 },
        end: { line: block.endLine, column: lastColumn(block.source) }
      },
      text: markdownProseToLatex(after)
    })
  }

  if (edits.length === 0) return { status: 'unchanged' }
  // Later edits first, so an earlier replacement cannot shift a later range.
  edits.sort((left, right) => right.range.start.line - left.range.start.line)
  return { status: 'ok', edits }
}

/** The span whose Markdown covers `line`, or the nearest one above it. */
export function spanAtMarkdownLine(document: ProseDocumentText, line: number): ProseSpan | null {
  let best: ProseSpan | null = null
  for (const span of document.spans) {
    if (span.startLine > line) break
    best = span
  }
  return best
}

/** The span produced by the block covering `line` in the `.tex` source. */
export function spanAtSourceLine(document: ProseDocumentText, line: number): ProseSpan | null {
  let best: ProseSpan | null = null
  for (const span of document.spans) {
    if (span.block.startLine > line) break
    best = span
  }
  return best
}

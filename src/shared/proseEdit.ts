import { markdownProseToLatex } from './proseInline'
import { isEditableProseBlock, type ProseBlock } from './proseProjection'

/**
 * Turning an edited prose block back into a source edit.
 *
 * The prose view never regenerates the document. It produces one replacement
 * confined to the block the author typed in — a paragraph's line range, or
 * just the braces of a heading title — so every construct outside that range
 * is untouched by construction rather than by careful re-serialization.
 */

export interface ProseSourceEdit {
  /** 1-based line, 1-based column, end exclusive — the editor's convention. */
  range: {
    start: { line: number; column: number }
    end: { line: number; column: number }
  }
  text: string
}

const HEADING_PREFIX = /^\s*#{1,6}\s*/u

/**
 * The edit for a block whose Markdown the author changed, or `null` when the
 * block is not editable or its text is unchanged.
 *
 * Callers must still confirm the document revision they projected from is the
 * one they are editing; a stale projection would aim at the wrong lines.
 */
export function proseBlockEdit(block: ProseBlock, markdown: string): ProseSourceEdit | null {
  if (!isEditableProseBlock(block)) return null

  if (block.kind === 'heading') {
    const range = block.titleRange
    if (!range) return null
    const title = markdownProseToLatex(markdown.replace(HEADING_PREFIX, '').trim())
    if (title === block.title) return null
    return {
      range: {
        start: { line: range.line, column: range.startColumn },
        end: { line: range.line, column: range.endColumn }
      },
      text: title
    }
  }

  const latex = markdownProseToLatex(markdown)
  if (latex === block.source) return null
  return {
    range: {
      start: { line: block.startLine, column: 1 },
      // Replacing to the start of the following line keeps the block's own
      // trailing newline out of the edit, so blank separators are preserved.
      end: { line: block.endLine, column: lastColumn(block.source) }
    },
    text: latex
  }
}

function lastColumn(source: string): number {
  const lines = source.split('\n')
  return lines[lines.length - 1].length + 1
}

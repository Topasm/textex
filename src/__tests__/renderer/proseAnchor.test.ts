import { describe, expect, it } from 'vitest'
import { projectLatexToProse } from '../../shared/proseProjection'
import { proseDocumentText, spanAtMarkdownLine, spanAtSourceLine } from '../../shared/proseDocument'

/**
 * The anchor that keeps the two halves on the same passage.
 *
 * A `.tex` line is the one coordinate the Markdown source and its rendering
 * both understand, so both lookups have to agree about which block owns it.
 */

const SOURCE = `\\begin{document}
\\section{Introduction}
\\label{sec:intro}

First paragraph.

\\section{Method}

Second paragraph.
Still the second.
\\end{document}`

const document = proseDocumentText(projectLatexToProse(SOURCE))

describe('spanAtMarkdownLine', () => {
  it('finds the block that owns a Markdown line', () => {
    const lines = document.markdown.split('\n')
    for (const [index, line] of lines.entries()) {
      if (line.trim() === '') continue
      const span = spanAtMarkdownLine(document, index + 1)
      expect(span, line).not.toBeNull()
      const owned = lines.slice(span!.startLine - 1, span!.endLine)
      expect(owned, line).toContain(line)
    }
  })

  it('attributes a blank separator to the block above it', () => {
    const blankIndex = document.markdown.split('\n').findIndex((line) => line.trim() === '')
    const span = spanAtMarkdownLine(document, blankIndex + 1)
    expect(span?.block.markdown).toBe('## Introduction')
  })

  it('returns nothing above the first block', () => {
    expect(spanAtMarkdownLine(document, 0)).toBeNull()
  })
})

describe('spanAtSourceLine', () => {
  it('maps a .tex line back to the block that produced it', () => {
    // `\section{Method}` sits on line 7 of the source.
    expect(spanAtSourceLine(document, 7)?.block.title).toBe('Method')
    expect(spanAtSourceLine(document, 5)?.block.markdown).toBe('First paragraph.')
  })

  it('holds the line inside a multi-line paragraph', () => {
    const span = spanAtSourceLine(document, 10)
    expect(span?.block.markdown).toBe('Second paragraph.\nStill the second.')
  })

  it('round-trips every block through both lookups', () => {
    for (const span of document.spans) {
      const back = spanAtSourceLine(document, span.block.startLine)
      expect(back?.startLine).toBe(span.startLine)
      const forward = spanAtMarkdownLine(document, span.startLine)
      expect(forward?.block.startLine).toBe(span.block.startLine)
    }
  })
})

import { describe, expect, it } from 'vitest'
import {
  isEditableProseBlock,
  projectLatexToProse,
  type ProseBlock
} from '../../shared/proseProjection'

const PAPER = `\\documentclass{article}
\\usepackage{amsmath}
\\newcommand{\\method}{TextEx}

\\begin{document}

\\begin{abstract}
We propose \\textbf{\\method}, a fast editor.
\\end{abstract}

\\section{Introduction}
\\label{sec:intro}

Existing approaches have trouble~\\cite{kim2026}.
See Figure~\\ref{fig:arch} for the layout.

% a note to self
\\begin{equation}
  y = f(x)
\\end{equation}

More prose after the equation.

\\subsection{Scope}

Only the body is editable.

\\begin{figure}[htbp]
  \\includegraphics{arch}
  \\caption{Architecture}
\\end{figure}

\\input{appendix}

\\end{document}
`

function reassemble(blocks: ProseBlock[]): string {
  return blocks.map((block) => block.source).join('\n')
}

function kinds(blocks: ProseBlock[]): string[] {
  return blocks.map((block) => block.kind)
}

describe('projectLatexToProse', () => {
  const { blocks, hasBody } = projectLatexToProse(PAPER)

  it('covers the document without gaps or overlap', () => {
    expect(hasBody).toBe(true)
    let previousEnd = 0
    for (const block of blocks) {
      expect(block.startLine).toBe(previousEnd + 1)
      expect(block.endLine).toBeGreaterThanOrEqual(block.startLine)
      previousEnd = block.endLine
    }
  })

  it('reassembles to the original source byte for byte', () => {
    // The projection is a view. Nothing is rewritten until an edit says so.
    expect(reassemble(blocks)).toBe(PAPER)
  })

  it('keeps the preamble out of the view', () => {
    const [first] = blocks
    expect(first.kind).toBe('boundary')
    expect(first.source).toContain('\\newcommand{\\method}')
    expect(first.markdown).toBe('')
  })

  it('projects sections and the abstract as Markdown headings', () => {
    const headings = blocks.filter((block) => block.kind === 'heading')
    expect(headings.map((block) => block.markdown)).toEqual([
      '## Abstract',
      '## Introduction',
      '### Scope'
    ])
  })

  it('gives a single-line heading a title range so only the title is rewritten', () => {
    const intro = blocks.find((block) => block.title === 'Introduction')!
    const line = PAPER.split('\n')[intro.titleRange!.line - 1]
    const { startColumn, endColumn } = intro.titleRange!
    expect(line.slice(startColumn - 1, endColumn - 1)).toBe('Introduction')
  })

  it('protects math, floats and includes rather than converting them', () => {
    const protectedLabels = blocks
      .filter((block) => block.kind === 'protected')
      .map((block) => block.protectedLabel)
    expect(protectedLabels).toEqual(['equation', 'figure', 'include'])
  })

  it('hides labels and comments while keeping them in the source', () => {
    const hidden = blocks.filter((block) => block.kind === 'hidden')
    expect(hidden.map((block) => block.source.trim())).toEqual([
      '\\end{abstract}',
      '\\label{sec:intro}',
      '% a note to self'
    ])
    expect(reassemble(blocks)).toContain('\\label{sec:intro}')
  })

  it('exposes prose paragraphs as editable Markdown', () => {
    const prose = blocks.filter((block) => block.kind === 'prose')
    expect(prose[0].markdown).toBe('We propose **\\method**, a fast editor.')
    expect(prose[1].markdown).toBe(
      'Existing approaches have trouble~\\cite{kim2026}.\nSee Figure~\\ref{fig:arch} for the layout.'
    )
  })

  it('marks only prose and titled headings editable', () => {
    for (const block of blocks) {
      const expected = block.kind === 'prose' || block.titleRange !== undefined
      expect(isEditableProseBlock(block), `${block.kind}:${block.startLine}`).toBe(expected)
    }
  })

  it('never lets a boundary, protected or hidden block be edited', () => {
    expect(kinds(blocks.filter(isEditableProseBlock)).every((kind) => kind !== 'boundary')).toBe(
      true
    )
  })
})

describe('documents the projection refuses', () => {
  it('reports no body when there is no document environment', () => {
    expect(projectLatexToProse('\\documentclass{article}\n')).toEqual({
      blocks: [],
      hasBody: false
    })
  })

  it('still covers a document with no closing tag', () => {
    const source = '\\documentclass{article}\n\\begin{document}\n\\section{A}\n\nBody.'
    const { blocks } = projectLatexToProse(source)
    expect(reassemble(blocks)).toBe(source)
  })

  it('leaves a heading whose argument wraps read-only', () => {
    const source = '\\begin{document}\n\\section{A very\nlong title}\n\nBody.\n\\end{document}'
    const { blocks } = projectLatexToProse(source)
    const heading = blocks.find((block) => block.kind === 'heading')!
    expect(heading.titleRange).toBeUndefined()
    expect(isEditableProseBlock(heading)).toBe(false)
    expect(reassemble(blocks)).toBe(source)
  })

  it('does not mistake a nested environment end for its own', () => {
    const source = [
      '\\begin{document}',
      '\\begin{figure}',
      '\\begin{subfigure}{0.5\\textwidth}',
      '\\end{subfigure}',
      '\\end{figure}',
      'After.',
      '\\end{document}'
    ].join('\n')
    const { blocks } = projectLatexToProse(source)
    const float = blocks.find((block) => block.protectedLabel === 'figure')!
    expect(float.source).toContain('\\end{subfigure}')
    expect(float.endLine).toBe(5)
    expect(reassemble(blocks)).toBe(source)
  })
})

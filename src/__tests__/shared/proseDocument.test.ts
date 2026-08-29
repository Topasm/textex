import { describe, expect, it } from 'vitest'
import { projectLatexToProse } from '../../shared/proseProjection'
import {
  proseDocumentEdits,
  proseDocumentText,
  type ProseSourceEdit
} from '../../shared/proseDocument'

const SOURCE = `\\documentclass{article}
\\newcommand{\\method}{TextEx}

\\begin{document}
\\section{Introduction}
\\label{sec:intro}

We propose \\textbf{\\method}~\\cite{kim2026}.
See Figure~\\ref{fig:arch}.

\\begin{equation}
  y = f(x)
\\end{equation}

\\subsection{Scope}

Only the body is editable.
\\end{document}`

function doc() {
  return proseDocumentText(projectLatexToProse(SOURCE))
}

/** Applies edits the way the editor would, newest range first. */
function apply(source: string, edits: ProseSourceEdit[]): string {
  let lines = source.split('\n')
  for (const edit of edits) {
    const head = lines[edit.range.start.line - 1].slice(0, edit.range.start.column - 1)
    const tail = lines[edit.range.end.line - 1].slice(edit.range.end.column - 1)
    lines = [
      ...lines.slice(0, edit.range.start.line - 1),
      `${head}${edit.text}${tail}`,
      ...lines.slice(edit.range.end.line)
    ]
  }
  return lines.join('\n')
}

describe('proseDocumentText', () => {
  it('shows headings, prose and protected blocks, and hides the rest', () => {
    expect(doc().markdown).toBe(
      [
        '## Introduction',
        '',
        'We propose **\\method**~\\cite{kim2026}.',
        'See Figure~\\ref{fig:arch}.',
        '',
        '\\begin{equation}',
        '  y = f(x)',
        '\\end{equation}',
        '',
        '### Scope',
        '',
        'Only the body is editable.'
      ].join('\n')
    )
  })

  it('keeps the preamble, label and macro out of view but in the source', () => {
    const { markdown } = doc()
    expect(markdown).not.toContain('\\documentclass')
    expect(markdown).not.toContain('\\newcommand')
    expect(markdown).not.toContain('\\label{sec:intro}')
  })

  it('maps every span onto its own Markdown lines', () => {
    const { markdown, spans } = doc()
    const lines = markdown.split('\n')
    for (const span of spans) {
      const text = lines.slice(span.startLine - 1, span.endLine).join('\n')
      expect(text).toBe(span.block.kind === 'protected' ? span.block.source : span.block.markdown)
    }
  })
})

describe('proseDocumentEdits', () => {
  it('reports nothing for an untouched document', () => {
    const document = doc()
    expect(proseDocumentEdits(document, document.markdown)).toEqual({ status: 'unchanged' })
  })

  it('rewrites only the paragraph the author changed', () => {
    const document = doc()
    const edited = document.markdown.replace(
      'See Figure~\\ref{fig:arch}.',
      'See Figure~\\ref{fig:arch} for the layout.'
    )

    const result = proseDocumentEdits(document, edited)
    expect(result.status).toBe('ok')
    const updated = apply(SOURCE, (result as { edits: ProseSourceEdit[] }).edits)

    expect(updated).toContain('See Figure~\\ref{fig:arch} for the layout.')
    // Everything the author did not touch is still byte for byte intact.
    expect(updated).toContain('\\newcommand{\\method}{TextEx}')
    expect(updated).toContain('\\label{sec:intro}')
    expect(updated).toContain('\\begin{equation}\n  y = f(x)\n\\end{equation}')
    expect(updated).toContain('\\subsection{Scope}')
  })

  it('rewrites only the braces when a heading title changes', () => {
    const document = doc()
    const result = proseDocumentEdits(
      document,
      document.markdown.replace('## Introduction', '## Motivation')
    )

    expect(result.status).toBe('ok')
    const updated = apply(SOURCE, (result as { edits: ProseSourceEdit[] }).edits)
    expect(updated).toContain('\\section{Motivation}')
    expect(updated).toContain('\\label{sec:intro}')
  })

  it('applies two independent edits without shifting each other', () => {
    const document = doc()
    const edited = document.markdown
      .replace('## Introduction', '## Motivation')
      .replace('Only the body is editable.', 'Only the body is editable, and that is the point.')

    const result = proseDocumentEdits(document, edited)
    expect(result.status).toBe('ok')
    const updated = apply(SOURCE, (result as { edits: ProseSourceEdit[] }).edits)

    expect(updated).toContain('\\section{Motivation}')
    expect(updated).toContain('Only the body is editable, and that is the point.')
    expect(updated).toContain('\\subsection{Scope}')
  })

  it('converts Markdown emphasis back to LaTeX', () => {
    const document = doc()
    const edited = document.markdown.replace(
      'Only the body is editable.',
      'Only the *body* is **editable**.'
    )

    const result = proseDocumentEdits(document, edited)
    const updated = apply(SOURCE, (result as { edits: ProseSourceEdit[] }).edits)
    expect(updated).toContain('Only the \\emph{body} is \\textbf{editable}.')
  })

  it('refuses an edit inside a protected block rather than guessing', () => {
    const document = doc()
    const edited = document.markdown.replace('  y = f(x)', '  y = g(x)')

    expect(proseDocumentEdits(document, edited)).toEqual({
      status: 'refused',
      reason: 'protectedChanged'
    })
  })

  it('refuses a heading that lost its Markdown level', () => {
    const document = doc()
    const edited = document.markdown.replace('## Introduction', 'Introduction')

    expect(proseDocumentEdits(document, edited)).toEqual({
      status: 'refused',
      reason: 'structureChanged'
    })
  })

  it('grows a paragraph the author extended with a new line', () => {
    const document = doc()
    const edited = document.markdown.replace(
      'See Figure~\\ref{fig:arch}.',
      'See Figure~\\ref{fig:arch}.\nAnd a second sentence.'
    )

    const result = proseDocumentEdits(document, edited)
    expect(result.status).toBe('ok')
    const updated = apply(SOURCE, (result as { edits: ProseSourceEdit[] }).edits)
    expect(updated).toContain('See Figure~\\ref{fig:arch}.\nAnd a second sentence.')
    expect(updated).toContain('\\begin{equation}')
  })
})

import { describe, expect, it } from 'vitest'
import { latexProseToMarkdown, markdownProseToLatex } from '../../shared/proseInline'

/** What the author sees, and what comes back when they hand it straight back. */
function roundTrip(latex: string): string {
  return markdownProseToLatex(latexProseToMarkdown(latex))
}

describe('latexProseToMarkdown', () => {
  it('converts the closed set of formatting commands', () => {
    expect(latexProseToMarkdown('a \\textbf{bold} b')).toBe('a **bold** b')
    expect(latexProseToMarkdown('a \\emph{soft} b')).toBe('a *soft* b')
    expect(latexProseToMarkdown('a \\texttt{code} b')).toBe('a `code` b')
  })

  it('leaves citations, references and math exactly as written', () => {
    const latex = 'See Figure~\\ref{fig:arch} and~\\cite{kim2026} for $O(n\\log n)$.'
    expect(latexProseToMarkdown(latex)).toBe(latex)
  })

  it('does not touch commands with no unique inverse', () => {
    // `\textit` and `\emph` would both project to `*x*`.
    expect(latexProseToMarkdown('\\textit{kept}')).toBe('\\textit{kept}')
  })

  it('escapes Markdown syntax that appears literally in prose', () => {
    expect(latexProseToMarkdown('a * b _ c [d]')).toBe('a \\* b \\_ c \\[d\\]')
  })

  it('never escapes inside an atom', () => {
    expect(latexProseToMarkdown('\\cite{a_b*c}')).toBe('\\cite{a_b*c}')
  })

  it('handles nesting and multi-argument commands', () => {
    expect(latexProseToMarkdown('\\textbf{very \\emph{deep}}')).toBe('**very *deep***')
    expect(latexProseToMarkdown('\\frac{1}{2} stays')).toBe('\\frac{1}{2} stays')
  })
})

describe('markdownProseToLatex', () => {
  it('restores the formatting commands', () => {
    expect(markdownProseToLatex('a **bold** b')).toBe('a \\textbf{bold} b')
    expect(markdownProseToLatex('a *soft* b')).toBe('a \\emph{soft} b')
    expect(markdownProseToLatex('a `code` b')).toBe('a \\texttt{code} b')
  })

  it('unescapes what the projection escaped', () => {
    expect(markdownProseToLatex('a \\* b \\_ c')).toBe('a * b _ c')
  })

  it('does not read Markdown syntax inside a LaTeX atom', () => {
    expect(markdownProseToLatex('\\cite{a_b} and *soft*')).toBe('\\cite{a_b} and \\emph{soft}')
  })
})

describe('round trip', () => {
  const samples = [
    'Plain prose with nothing special.',
    'We propose \\textbf{TextEx}~\\cite{kim2026}.',
    'See Figure~\\ref{fig:arch}, Section~\\ref{sec:intro}.',
    'Inline $x^2 + y^2 = z^2$ and \\(a \\ne b\\).',
    'A literal asterisk * and underscore _ and bracket [x].',
    '\\textbf{bold with \\cite{key} inside}',
    '\\textit{unconverted} next to \\emph{converted}',
    'Escaped percent \\% and ampersand \\& survive.',
    '\\frac{1}{2} of \\texttt{code_with_underscore}',
    'Multiple **like** characters that are not Markdown: 2*3*4',
    // A star closing emphasis is not the command's own star.
    '\\textbf{\\method} and \\section*{Aside}',
    'Bold around a macro: \\textbf{\\method}',
    'Emphasis around a macro: \\emph{\\method}'
  ]

  for (const sample of samples) {
    it(`is identity for: ${sample.slice(0, 46)}`, () => {
      expect(roundTrip(sample)).toBe(sample)
    })
  }
})

describe('starred commands versus Markdown emphasis', () => {
  it('does not let a bold fence be eaten as a command star', () => {
    expect(markdownProseToLatex('We propose **\\method**.')).toBe('We propose \\textbf{\\method}.')
    expect(markdownProseToLatex('We propose *\\method*.')).toBe('We propose \\emph{\\method}.')
  })

  it('still treats a real starred command as one atom', () => {
    expect(markdownProseToLatex('\\section*{Aside} follows')).toBe('\\section*{Aside} follows')
    expect(latexProseToMarkdown('\\section*{Aside} follows')).toBe('\\section*{Aside} follows')
  })
})

import { describe, expect, it } from 'vitest'
import { projectLatexToProse } from '../../shared/proseProjection'
import { latexProseToMarkdown, markdownProseToLatex } from '../../shared/proseInline'

/**
 * The safety property the prose view rests on.
 *
 * A projection is a view, not a conversion: a document nobody edited has to
 * come back byte for byte, whatever it contains. These generate documents out
 * of the constructs the projector knows and the ones it deliberately does not,
 * so a parser change that starts swallowing a line fails here rather than in
 * someone's paper.
 */

const FRAGMENTS = [
  '\\section{One}',
  '\\subsection{Two}',
  '\\subsubsection{Three}',
  '\\chapter{Zero}',
  '\\section*{Unnumbered}',
  '\\label{sec:a}',
  '% comment line',
  '',
  'Plain prose line.',
  'Prose with~\\cite{key} and \\ref{fig:x}.',
  'Prose with \\textbf{bold} and \\emph{soft}.',
  'Prose with $x^2$ inline math.',
  '\\begin{equation}\n  y = f(x)\n\\end{equation}',
  '\\begin{align}\n  a &= b \\\\\n  c &= d\n\\end{align}',
  '\\begin{figure}[htbp]\n  \\includegraphics{a}\n  \\caption{C}\n\\end{figure}',
  '\\begin{table}\n  \\begin{tabular}{ll}\n    a & b\n  \\end{tabular}\n\\end{table}',
  '\\begin{itemize}\n  \\item First\n  \\item Second\n\\end{itemize}',
  '\\begin{abstract}\nAn abstract body.\n\\end{abstract}',
  '\\[\n  E = mc^2\n\\]',
  '$$\n  a + b\n$$',
  '\\input{chapter}',
  '\\printbibliography',
  '\\begin{theorem}\n  Custom environment.\n\\end{theorem}',
  '\\newcommand{\\x}{y}',
  'Trailing prose with unmatched brace { in text.'
]

/** Deterministic so a failure is reproducible from the seed alone. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function buildDocument(random: () => number): string {
  const body: string[] = []
  const count = 3 + Math.floor(random() * 12)
  for (let index = 0; index < count; index += 1) {
    body.push(FRAGMENTS[Math.floor(random() * FRAGMENTS.length)])
  }
  return [
    '\\documentclass{article}',
    '\\usepackage{amsmath}',
    '',
    '\\begin{document}',
    ...body,
    '\\end{document}',
    ''
  ].join('\n')
}

describe('projection safety', () => {
  it('reassembles every generated document unchanged', () => {
    const failures: string[] = []
    for (let seed = 1; seed <= 400; seed += 1) {
      const source = buildDocument(makeRandom(seed))
      const { blocks } = projectLatexToProse(source)
      if (blocks.map((block) => block.source).join('\n') !== source) {
        failures.push(`seed ${seed}`)
      }
    }
    expect(failures).toEqual([])
  })

  it('covers every line exactly once in every generated document', () => {
    const failures: string[] = []
    for (let seed = 1; seed <= 400; seed += 1) {
      const source = buildDocument(makeRandom(seed))
      const { blocks } = projectLatexToProse(source)
      let expectedStart = 1
      for (const block of blocks) {
        if (block.startLine !== expectedStart || block.endLine < block.startLine) {
          failures.push(`seed ${seed} at line ${block.startLine}`)
          break
        }
        expectedStart = block.endLine + 1
      }
      if (expectedStart !== source.split('\n').length + 1) failures.push(`seed ${seed} short`)
    }
    expect(failures).toEqual([])
  })

  it('never exposes a preamble or protected construct as editable prose', () => {
    const leaked: string[] = []
    for (let seed = 1; seed <= 400; seed += 1) {
      const source = buildDocument(makeRandom(seed))
      for (const block of projectLatexToProse(source).blocks) {
        if (block.kind !== 'prose') continue
        // A prose block must never contain a construct the projector protects.
        if (/\\(begin|end|newcommand|input|documentclass|usepackage)\b/u.test(block.source)) {
          leaked.push(`seed ${seed}: ${block.source.slice(0, 40)}`)
        }
      }
    }
    expect(leaked).toEqual([])
  })

  it('round-trips every prose block that nobody edited', () => {
    const drift: string[] = []
    for (let seed = 1; seed <= 400; seed += 1) {
      const source = buildDocument(makeRandom(seed))
      for (const block of projectLatexToProse(source).blocks) {
        if (block.kind !== 'prose') continue
        const back = markdownProseToLatex(latexProseToMarkdown(block.source))
        if (back !== block.source) drift.push(`seed ${seed}: ${block.source.slice(0, 40)}`)
      }
    }
    expect(drift).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { projectLatexToProse } from '../../shared/proseProjection'
import { proseDocumentEdits, proseDocumentText } from '../../shared/proseDocument'

/**
 * The guarantee the prose editor rests on.
 *
 * However the author rewrites the Markdown, the parts of the `.tex` that no
 * edit was attributed to must come back byte for byte, and an edit that cannot
 * be expressed must be refused rather than approximated.
 */

const FRAGMENTS = [
  '\\section{One}',
  '\\subsection{Two}',
  '\\label{sec:a}',
  '% a comment',
  '',
  'A plain sentence.',
  'A sentence with~\\cite{key} and \\ref{fig:x}.',
  'A sentence with \\textbf{bold} and \\emph{soft}.',
  '\\begin{equation}\n  y = f(x)\n\\end{equation}',
  '\\begin{figure}\n  \\caption{C}\n\\end{figure}',
  '\\newcommand{\\x}{y}',
  'Trailing prose.'
]

function makeRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function buildDocument(random: () => number): string {
  const body: string[] = []
  const count = 3 + Math.floor(random() * 10)
  for (let index = 0; index < count; index += 1) {
    body.push(FRAGMENTS[Math.floor(random() * FRAGMENTS.length)])
  }
  return ['\\documentclass{article}', '', '\\begin{document}', ...body, '\\end{document}', ''].join(
    '\n'
  )
}

function apply(
  source: string,
  edits: ReadonlyArray<{
    range: { start: { line: number; column: number }; end: { line: number; column: number } }
    text: string
  }>
): string {
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

describe('prose document write-back', () => {
  it('reports no edits when the Markdown is handed back untouched', () => {
    const drift: string[] = []
    for (let seed = 1; seed <= 300; seed += 1) {
      const source = buildDocument(makeRandom(seed))
      const document = proseDocumentText(projectLatexToProse(source))
      if (proseDocumentEdits(document, document.markdown).status !== 'unchanged') {
        drift.push(`seed ${seed}`)
      }
    }
    expect(drift).toEqual([])
  })

  it('never touches the preamble, labels or comments when a sentence changes', () => {
    const damaged: string[] = []
    for (let seed = 1; seed <= 300; seed += 1) {
      const source = buildDocument(makeRandom(seed))
      const document = proseDocumentText(projectLatexToProse(source))
      if (!document.markdown.includes('A plain sentence.')) continue

      const result = proseDocumentEdits(
        document,
        document.markdown.replace('A plain sentence.', 'A rewritten sentence entirely.')
      )
      if (result.status !== 'ok') {
        damaged.push(`seed ${seed}: ${result.status}`)
        continue
      }

      const updated = apply(source, result.edits)
      for (const preserved of [
        '\\documentclass{article}',
        '\\begin{document}',
        '\\end{document}'
      ]) {
        if (!updated.includes(preserved)) damaged.push(`seed ${seed}: lost ${preserved}`)
      }
      for (const preserved of ['\\label{sec:a}', '% a comment', '\\newcommand{\\x}{y}']) {
        if (source.includes(preserved) && !updated.includes(preserved)) {
          damaged.push(`seed ${seed}: lost ${preserved}`)
        }
      }
      if (source.includes('y = f(x)') && !updated.includes('  y = f(x)')) {
        damaged.push(`seed ${seed}: math body changed`)
      }
      if (!updated.includes('A rewritten sentence entirely.')) {
        damaged.push(`seed ${seed}: edit not applied`)
      }
    }
    expect(damaged).toEqual([])
  })

  it('refuses rather than approximates when a protected block is edited', () => {
    const accepted: string[] = []
    for (let seed = 1; seed <= 300; seed += 1) {
      const source = buildDocument(makeRandom(seed))
      const document = proseDocumentText(projectLatexToProse(source))
      if (!document.markdown.includes('  y = f(x)')) continue

      const result = proseDocumentEdits(
        document,
        document.markdown.replace('  y = f(x)', '  y = g(x)')
      )
      if (result.status !== 'refused') accepted.push(`seed ${seed}: ${result.status}`)
    }
    expect(accepted).toEqual([])
  })
})

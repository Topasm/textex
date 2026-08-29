import { describe, expect, it } from 'vitest'
import { projectLatexToProse, type ProseBlock } from '../../shared/proseProjection'
import { proseBlockEdit } from '../../shared/proseEdit'

const SOURCE = `\\begin{document}
\\section{Introduction}
\\label{sec:intro}

We propose \\textbf{TextEx}~\\cite{kim2026}.
See Figure~\\ref{fig:arch}.

\\begin{equation}
  y = f(x)
\\end{equation}
\\end{document}`

/** Applies one edit the way the editor would, so the result is verifiable. */
function applyEdit(source: string, edit: NonNullable<ReturnType<typeof proseBlockEdit>>): string {
  const lines = source.split('\n')
  const before = lines.slice(0, edit.range.start.line - 1)
  const after = lines.slice(edit.range.end.line)
  const head = lines[edit.range.start.line - 1].slice(0, edit.range.start.column - 1)
  const tail = lines[edit.range.end.line - 1].slice(edit.range.end.column - 1)
  return [...before, `${head}${edit.text}${tail}`, ...after].join('\n')
}

function blockOf(kind: ProseBlock['kind'], index = 0): ProseBlock {
  return projectLatexToProse(SOURCE).blocks.filter((block) => block.kind === kind)[index]
}

describe('proseBlockEdit', () => {
  it('rewrites only the paragraph the author changed', () => {
    const prose = blockOf('prose')
    const edit = proseBlockEdit(prose, 'We propose **TextEx**~\\cite{kim2026}, a fast editor.')!

    const updated = applyEdit(SOURCE, edit)
    expect(updated).toContain('\\textbf{TextEx}~\\cite{kim2026}, a fast editor.')
    // Everything the author did not touch is still exactly there.
    expect(updated).toContain('\\label{sec:intro}')
    expect(updated).toContain('\\begin{equation}\n  y = f(x)\n\\end{equation}')
    expect(updated).toContain('\\section{Introduction}')
  })

  it('rewrites only the braces of a heading title', () => {
    const heading = blockOf('heading')
    const edit = proseBlockEdit(heading, '## Motivation')!

    expect(edit.text).toBe('Motivation')
    const updated = applyEdit(SOURCE, edit)
    expect(updated).toContain('\\section{Motivation}')
    expect(updated).toContain('\\label{sec:intro}')
  })

  it('returns nothing when the text is unchanged', () => {
    const prose = blockOf('prose')
    expect(proseBlockEdit(prose, prose.markdown)).toBeNull()

    const heading = blockOf('heading')
    expect(proseBlockEdit(heading, heading.markdown)).toBeNull()
  })

  it('refuses to edit a protected or hidden block', () => {
    expect(proseBlockEdit(blockOf('protected'), 'anything')).toBeNull()
    expect(proseBlockEdit(blockOf('hidden'), 'anything')).toBeNull()
    expect(proseBlockEdit(blockOf('boundary'), 'anything')).toBeNull()
  })

  it('keeps an edited paragraph inside its own line range', () => {
    const prose = blockOf('prose')
    const edit = proseBlockEdit(prose, 'One short line.')!

    expect(edit.range.start.line).toBe(prose.startLine)
    expect(edit.range.end.line).toBe(prose.endLine)
    const updated = applyEdit(SOURCE, edit)
    // The blank separators around the paragraph survive the replacement.
    expect(updated).toContain('\\label{sec:intro}\n\nOne short line.\n\n\\begin{equation}')
  })
})

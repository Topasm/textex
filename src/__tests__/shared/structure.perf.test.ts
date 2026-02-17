import { describe, it, expect } from 'vitest'
import { parseContentOutline } from '../../shared/structure'

describe('outline performance', () => {
  it('parses a large document within reasonable time', () => {
    // Generate ~3000 lines of LaTeX
    const lines: string[] = []
    lines.push('\\documentclass{article}')
    lines.push('\\begin{document}')

    for (let i = 0; i < 500; i++) {
      lines.push(`\\section{Section ${i}}`)
      lines.push(`Content for section ${i}.`)
      for (let j = 0; j < 5; j++) {
        lines.push(`\\subsection{Subsection ${i}.${j}}`)
        lines.push(`More content.`)
      }
    }
    lines.push('\\end{document}')
    const content = lines.join('\n')

    const start = performance.now()
    const outline = parseContentOutline(content, 'test.tex')
    const end = performance.now()
    const duration = end - start

    console.log(`Parsed ${lines.length} lines in ${duration.toFixed(2)}ms`)

    // Expect < 200ms for ~3000 lines
    // This threshold is generous for local dev but ensures no major regressions (like O(N^2))
    expect(duration).toBeLessThan(500)
    expect(outline.length).toBeGreaterThan(0)
  })
})

import { describe, expect, it } from 'vitest'
import { formatLatexDirect } from '../../renderer/utils/formatterRuntime'

describe('formatLatexDirect', () => {
  it('loads the real Prettier modules and formats LaTeX source', async () => {
    const source = [
      '\\documentclass{article}',
      '\\begin{document}',
      '\\section{  Hello   World }',
      'Text   here.',
      '\\end{document}'
    ].join('\n')

    await expect(formatLatexDirect(source)).resolves.toBe(
      [
        '\\documentclass{article}',
        '\\begin{document}',
        '  \\section{ Hello World }',
        '  Text here.',
        '\\end{document}'
      ].join('\n')
    )
  })
})

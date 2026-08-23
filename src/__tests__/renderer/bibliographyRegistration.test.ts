import { describe, expect, it } from 'vitest'
import { buildBibliographyRegistration } from '../../renderer/services/bibliographyRegistration'

describe('bibliography registration preview', () => {
  it('adds a BibLaTeX resource before the document body', () => {
    const original = String.raw`\documentclass{article}
\usepackage{biblatex}
\begin{document}
Hello
\end{document}`
    const request = buildBibliographyRegistration('/project/main.tex', original, 'references.bib')

    expect(request?.mode).toBe('biblatex')
    expect(request?.command).toBe(String.raw`\addbibresource{references.bib}`)
    expect(request?.proposedContent).toContain(
      String.raw`\addbibresource{references.bib}` + '\n' + String.raw`\begin{document}`
    )
  })

  it('extends an existing BibTeX bibliography and skips an existing registration', () => {
    const original = String.raw`\documentclass{article}
\begin{document}
\bibliography{legacy}
\end{document}`
    const request = buildBibliographyRegistration('/project/main.tex', original, 'references.bib')
    expect(request?.command).toBe(String.raw`\bibliography{legacy,references}`)

    expect(
      buildBibliographyRegistration(
        '/project/main.tex',
        request?.proposedContent ?? '',
        'references.bib'
      )
    ).toBeNull()
  })

  it('proposes a safe default BibTeX block before end document', () => {
    const request = buildBibliographyRegistration(
      '/project/main.tex',
      String.raw`\documentclass{article}
\begin{document}
Hello
\end{document}`,
      'references.bib'
    )
    expect(request?.proposedContent).toContain(
      String.raw`\bibliographystyle{plain}` +
        '\n' +
        String.raw`\bibliography{references}` +
        '\n' +
        String.raw`\end{document}`
    )
  })
})

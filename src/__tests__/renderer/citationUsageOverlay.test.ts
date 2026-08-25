import { describe, expect, it } from 'vitest'
import {
  overlayCitationUsages,
  parseCitationUsages
} from '../../renderer/services/citationUsageOverlay'

describe('citation usage overlays', () => {
  it('parses supported citation commands and ignores comments', () => {
    expect(
      parseCitationUsages(String.raw`\cite{alpha,beta} % \cite{ignored}
\textcite[see][p. 2]{alpha}
escaped \% \autocite{gamma}`)
    ).toEqual([
      { citekey: 'alpha', count: 2 },
      { citekey: 'beta', count: 1 },
      { citekey: 'gamma', count: 1 }
    ])
  })

  it('replaces saved-file counts with unsaved editor counts', () => {
    expect(
      overlayCitationUsages(
        [
          { citekey: 'alpha', count: 2 },
          { citekey: 'other-file', count: 1 }
        ],
        [{ savedText: String.raw`\cite{alpha}`, currentText: String.raw`\cite{beta}` }]
      )
    ).toEqual([
      { citekey: 'alpha', count: 1 },
      { citekey: 'beta', count: 1 },
      { citekey: 'other-file', count: 1 }
    ])
  })

  it('records source lines and replaces saved locations for a dirty file', () => {
    expect(
      overlayCitationUsages(
        [
          {
            citekey: 'alpha',
            count: 2,
            locations: [
              { file: '/project/main.tex', line: 1 },
              { file: '/project/chapter.tex', line: 8 }
            ]
          }
        ],
        [
          {
            filePath: '/project/main.tex',
            savedText: String.raw`\cite{alpha}`,
            currentText: `Introduction\n${String.raw`\cite{alpha}`}\n${String.raw`\cite{beta}`}`
          }
        ]
      )
    ).toEqual([
      {
        citekey: 'alpha',
        count: 2,
        locations: [
          { file: '/project/chapter.tex', line: 8 },
          { file: '/project/main.tex', line: 2 }
        ]
      },
      { citekey: 'beta', count: 1, locations: [{ file: '/project/main.tex', line: 3 }] }
    ])
  })
})

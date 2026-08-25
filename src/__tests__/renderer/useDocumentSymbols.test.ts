import { describe, expect, it } from 'vitest'
import { sectionNodesToSymbols } from '../../renderer/hooks/editor/useDocumentSymbols'
import type { SectionNode } from '../../shared/types'

describe('useDocumentSymbols helpers', () => {
  it('maps fallback outline nodes with semantic kinds', () => {
    const sectionNodes: SectionNode[] = [
      {
        title: 'Abstract',
        level: 1,
        starred: false,
        file: '/tmp/main.tex',
        startLine: 3,
        endLine: 5,
        semanticKind: 'frontmatter',
        children: []
      },
      {
        title: 'Introduction',
        level: 1,
        starred: false,
        file: '/tmp/main.tex',
        startLine: 6,
        endLine: 10,
        semanticKind: 'section',
        children: []
      }
    ]

    expect(sectionNodesToSymbols(sectionNodes).map((node) => node.semanticKind)).toEqual([
      'frontmatter',
      'section'
    ])
  })
})

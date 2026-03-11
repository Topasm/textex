import { describe, expect, it } from 'vitest'
import {
  extractBandSymbols,
  mergeBandSymbols,
  sectionNodesToSymbols
} from '../../renderer/hooks/editor/useDocumentSymbols'
import type { DocumentSymbolNode, SectionNode } from '../../shared/types'

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

  it('extracts band symbols from fallback outline nodes', () => {
    const symbols = extractBandSymbols([
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
        title: 'Intro',
        level: 1,
        starred: false,
        file: '/tmp/main.tex',
        startLine: 6,
        endLine: 10,
        semanticKind: 'section',
        children: []
      }
    ])

    expect(symbols).toHaveLength(2)
    expect(symbols[0].name).toBe('Abstract')
    expect(symbols[0].semanticKind).toBe('frontmatter')
    expect(symbols[1].semanticKind).toBe('section')
    expect(symbols[0].range.startLine).toBe(3)
  })

  it('merges band symbols into top-level symbols without duplicates', () => {
    const lspSymbols: DocumentSymbolNode[] = [
      {
        name: 'Introduction',
        detail: '',
        kind: 5,
        range: { startLine: 6, startColumn: 1, endLine: 10, endColumn: 1 },
        selectionRange: { startLine: 6, startColumn: 1, endLine: 6, endColumn: 1 },
        children: []
      }
    ]
    const bandSymbols: DocumentSymbolNode[] = [
      {
        name: 'Abstract',
        detail: '',
        kind: 1,
        range: { startLine: 3, startColumn: 1, endLine: 5, endColumn: 1 },
        selectionRange: { startLine: 3, startColumn: 1, endLine: 3, endColumn: 1 },
        semanticKind: 'frontmatter',
        children: []
      },
      {
        name: 'Introduction',
        detail: '',
        kind: 2,
        range: { startLine: 6, startColumn: 1, endLine: 10, endColumn: 1 },
        selectionRange: { startLine: 6, startColumn: 1, endLine: 6, endColumn: 1 },
        semanticKind: 'section',
        children: []
      }
    ]

    const merged = mergeBandSymbols(lspSymbols, bandSymbols)

    expect(merged.map((node) => node.name)).toEqual(['Abstract', 'Introduction'])
    expect(merged.map((node) => node.semanticKind)).toEqual(['frontmatter', 'section'])
  })
})

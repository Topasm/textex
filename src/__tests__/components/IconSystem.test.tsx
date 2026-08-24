import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { Search } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import {
  ICON_SIZE,
  ICON_STROKE_WIDTH,
  IconSystemProvider
} from '../../renderer/components/ui/IconSystem'

describe('IconSystemProvider', () => {
  it('applies the shared size, physical stroke, class, and decorative semantics', () => {
    render(
      <IconSystemProvider>
        <Search data-testid="shared-icon" />
      </IconSystemProvider>
    )

    const icon = screen.getByTestId('shared-icon')
    expect(ICON_SIZE.control).toBe(16)
    expect(ICON_STROKE_WIDTH).toBe(1.75)
    expect(icon).toHaveClass('ui-icon')
    expect(icon).toHaveAttribute('width', '16')
    expect(icon).toHaveAttribute('height', '16')
    expect(icon).toHaveAttribute('stroke-width', '2.625')
    expect(icon).toHaveAttribute('aria-hidden', 'true')
  })

  it('keeps migrated controls free of hand-drawn SVG and legacy UI glyphs', () => {
    const componentPaths = [
      'Toolbar.tsx',
      'FileTree.tsx',
      'TabBar.tsx',
      'StatusBar.tsx',
      'TimelinePanel.tsx',
      'TodoPanel.tsx',
      'OutlinePanel.tsx',
      'LogPanel.tsx',
      'GitPanel.tsx',
      'MathPreviewWidget.tsx',
      'AiAssistantModal.tsx',
      'DraftModal.tsx',
      'TemplateGallery.tsx',
      'HistoryPanel.tsx',
      'TableEditorModal.tsx',
      'bib/BibEntryCard.tsx',
      'bib/BibGroupHeader.tsx',
      'omnisearch-panels/CitationSearchPanel.tsx',
      'omnisearch-panels/ZoteroSearchPanel.tsx',
      'omnisearch-panels/PdfSearchPanel.tsx'
    ]

    for (const componentPath of componentPaths) {
      const source = readFileSync(
        resolve(process.cwd(), 'src/renderer/components', componentPath),
        'utf8'
      )
      expect(source, componentPath).not.toMatch(
        /<svg\b|&times;|&#x(?:2395|25b2|25b6|25bc|270e);|[×✓✕✖⚠]/i
      )
    }
  })
})

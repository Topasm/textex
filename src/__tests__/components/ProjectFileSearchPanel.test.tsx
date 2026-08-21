import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProjectFileSearchPanel } from '../../renderer/components/omnisearch-panels/ProjectFileSearchPanel'

describe('ProjectFileSearchPanel', () => {
  it('renders indexed paths and opens the selected file', () => {
    const openFile = vi.fn()
    const setHighlightedIndex = vi.fn()
    const result = {
      path: '/project/chapters/intro.tex',
      relativePath: 'chapters/intro.tex',
      parentRelativePath: 'chapters',
      name: 'intro.tex',
      type: 'file' as const
    }

    render(
      <ProjectFileSearchPanel
        results={[result]}
        searchTerm="intro"
        highlightedIndex={0}
        setHighlightedIndex={setHighlightedIndex}
        openFile={openFile}
      />
    )

    const row = screen.getByText('intro.tex').closest('.omni-search-result')
    expect(screen.getByText('chapters/intro.tex')).toBeInTheDocument()
    fireEvent.mouseEnter(row!)
    expect(setHighlightedIndex).toHaveBeenCalledWith(0)
    fireEvent.click(row!)
    expect(openFile).toHaveBeenCalledWith(result)
  })
})

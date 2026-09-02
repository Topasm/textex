import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BibPanel from '../../renderer/components/BibPanel'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import type { BibEntry } from '../../shared/types'

const entries: BibEntry[] = [
  {
    key: 'zhang2025laps',
    type: 'article',
    title: 'Latent Action Primitive Segmentation',
    author: 'Zhang, Jiajie',
    year: '2025'
  },
  {
    key: 'deng2025sbd',
    type: 'inproceedings',
    title: 'Open-World Skill Discovery',
    author: 'Deng, Jingwen',
    year: '2025'
  }
]

describe('BibPanel citation groups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useProjectStore.setState({
      projectRoot: '/project',
      bibEntries: entries,
      citationGroups: [{ id: 'g1', name: 'Related work', citekeys: ['zhang2025laps'] }],
      researchSearchQuery: ''
    })
    vi.mocked(window.api.saveCitationGroups).mockResolvedValue(undefined as never)
  })

  it('shows groups and the ungrouped remainder, with no grouping modes to choose', () => {
    render(<BibPanel />)

    expect(screen.getByText(/Related work/)).toBeInTheDocument()
    expect(screen.getByText(/Ungrouped/)).toBeInTheDocument()
    // The flat/author/year/type views duplicated the References list.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('files an ungrouped entry into a group the user picks', () => {
    render(<BibPanel />)
    const card = screen.getByText('Open-World Skill Discovery').closest('.bib-entry')

    fireEvent.contextMenu(card!, { clientX: 10, clientY: 10 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add to “Related work”' }))

    expect(useProjectStore.getState().citationGroups[0].citekeys).toEqual([
      'zhang2025laps',
      'deng2025sbd'
    ])
  })

  it('keeps its filter out of the shared research search field', () => {
    render(<BibPanel />)

    fireEvent.change(screen.getByLabelText('Filter citations...'), { target: { value: 'skill' } })

    expect(screen.queryByText('Latent Action Primitive Segmentation')).not.toBeInTheDocument()
    expect(screen.getByText('Open-World Skill Discovery')).toBeInTheDocument()
    expect(useProjectStore.getState().researchSearchQuery).toBe('')
  })
})

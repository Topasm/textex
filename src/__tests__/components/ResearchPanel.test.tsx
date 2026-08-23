import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OnlineReferences } from '../../renderer/components/research/OnlineReferences'
import { ZoteroReferences } from '../../renderer/components/research/ZoteroReferences'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'

describe('research reference workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useProjectStore.setState({ projectRoot: '/project', bibEntries: [] })
    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, zoteroPort: 23_119 }
    }))
    vi.mocked(window.api.findBibInProject).mockResolvedValue([])
  })

  it('searches online providers and atomically adds a citation', async () => {
    const reference = {
      source: 'crossref' as const,
      id: '10.1000/example',
      title: 'A Useful Paper',
      authors: ['Ada Smith'],
      year: '2026',
      type: 'journal-article',
      doi: '10.1000/example'
    }
    vi.mocked(window.api.researchSearchOnline).mockResolvedValue([reference])
    vi.mocked(window.api.researchAddOnline).mockResolvedValue({
      filePath: '/project/references.bib',
      citekey: 'Smith2026Useful',
      inserted: true,
      duplicate: false
    })

    render(<OnlineReferences />)
    fireEvent.change(screen.getByLabelText('Search Crossref and arXiv'), {
      target: { value: 'useful paper' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(await screen.findByText('A Useful Paper')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Add & cite/i }))
    await waitFor(() => expect(window.api.researchAddOnline).toHaveBeenCalledWith(reference))
  })

  it('loads collections and persists the selected project research config', async () => {
    vi.mocked(window.api.researchLoadConfig).mockResolvedValue({
      version: 1,
      referencesFile: 'references.bib',
      zoteroFile: 'zotero.bib',
      zoteroCollection: null,
      syncOnOpen: false
    })
    vi.mocked(window.api.zoteroCollections).mockResolvedValue([
      { key: '/0/ABC', name: 'Research', parentKey: null, itemCount: 4 }
    ])
    vi.mocked(window.api.researchSaveConfig).mockImplementation(async (config) => config)

    render(<ZoteroReferences />)
    fireEvent.click(await screen.findByRole('treeitem', { name: /Research/ }))
    fireEvent.click(screen.getByTitle('Save research settings'))
    await waitFor(() =>
      expect(window.api.researchSaveConfig).toHaveBeenCalledWith(
        expect.objectContaining({ zoteroCollection: '/0/ABC' })
      )
    )
  })

  it('saves an online result to the Zotero library independently of citing it', async () => {
    const reference = {
      source: 'arxiv' as const,
      id: '2401.12345',
      title: 'A Saved Paper',
      authors: ['Ada Smith'],
      year: '2024',
      type: 'preprint',
      arxivId: '2401.12345'
    }
    vi.mocked(window.api.researchSearchOnline).mockResolvedValue([reference])
    vi.mocked(window.api.zoteroSaveOnline).mockResolvedValue({
      itemKey: 'ABC12345',
      citekey: 'Smith2024Saved',
      duplicate: false
    })

    render(<OnlineReferences />)
    fireEvent.change(screen.getByLabelText('Search Crossref and arXiv'), {
      target: { value: 'saved paper' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    fireEvent.click(await screen.findByRole('button', { name: /Save to library/i }))

    await waitFor(() => expect(window.api.zoteroSaveOnline).toHaveBeenCalledWith(reference, 23_119))
    expect(await screen.findByText(/Saved to Zotero as @Smith2024Saved/)).toBeInTheDocument()
  })
})

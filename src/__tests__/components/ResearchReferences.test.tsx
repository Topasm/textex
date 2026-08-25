import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OnlineReferences } from '../../renderer/components/research/OnlineReferences'
import { ReferencesPanel } from '../../renderer/components/research/ReferencesPanel'
import { ZoteroReferences } from '../../renderer/components/research/ZoteroReferences'
import * as referenceActions from '../../renderer/components/research/referenceActions'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'
import { useCompileStore } from '../../renderer/store/useCompileStore'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { invalidateZoteroInventory } from '../../renderer/services/zoteroInventoryCache'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

const config = {
  version: 1 as const,
  referencesFile: 'references.bib',
  zoteroFile: 'zotero.bib',
  zoteroCollection: null,
  syncOnOpen: false
}

const libraryTree = (
  collections: Array<{
    key: string
    name: string
    parentKey: string | null
    itemCount: number | null
  }>
) => [{ key: '/0', name: 'My Library', itemCount: 438, collections }]

describe('Research reference sources', () => {
  beforeEach(() => {
    invalidateZoteroInventory()
    vi.restoreAllMocks()
    useProjectStore.setState({
      projectRoot: '/project-a',
      bibEntries: [],
      researchSearchQuery: '',
      researchReferenceSource: 'project'
    })
    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, zoteroPort: 23_119 }
    }))
    useCompileStore.setState({ diagnostics: [] })
    useEditorStore.getState().resetEditor()
  })

  it('ignores a late Zotero load from the previous project', async () => {
    const firstConfig = deferred<typeof config>()
    window.api.researchLoadConfig = vi
      .fn()
      .mockReturnValueOnce(firstConfig.promise)
      .mockResolvedValueOnce(config)
    window.api.zoteroLibraryTree = vi
      .fn()
      .mockResolvedValueOnce(
        libraryTree([{ key: '/0/A', name: 'Project A papers', parentKey: null, itemCount: 1 }])
      )
      .mockResolvedValueOnce(
        libraryTree([{ key: '/0/B', name: 'Project B papers', parentKey: null, itemCount: 2 }])
      )

    render(<ZoteroReferences />)
    await waitFor(() => expect(window.api.researchLoadConfig).toHaveBeenCalledOnce())
    act(() => useProjectStore.getState().setProjectRoot('/project-b'))

    expect(await screen.findByText('Project B papers')).toBeInTheDocument()
    await act(async () => {
      firstConfig.resolve(config)
      await firstConfig.promise
    })

    expect(screen.queryByText('Project A papers')).not.toBeInTheDocument()
    expect(screen.getByText('Project B papers')).toBeInTheDocument()
  })

  it('does not display online search results completed for the previous project', async () => {
    const pendingSearch = deferred<
      Array<{
        source: 'crossref'
        id: string
        title: string
        authors: string[]
        year: string
        type: string
      }>
    >()
    window.api.researchSearchOnline = vi.fn().mockReturnValue(pendingSearch.promise)

    render(<OnlineReferences />)
    const search = screen.getByRole('textbox', { name: 'Search Crossref and arXiv' })
    fireEvent.change(search, { target: { value: 'robot paper' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(window.api.researchSearchOnline).toHaveBeenCalledOnce())

    act(() => useProjectStore.getState().setProjectRoot('/project-b'))
    await act(async () => {
      pendingSearch.resolve([
        {
          source: 'crossref',
          id: 'old-result',
          title: 'Old project result',
          authors: [],
          year: '2026',
          type: 'article'
        }
      ])
      await pendingSearch.promise
    })

    expect(screen.queryByText('Old project result')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Search Crossref and arXiv' })).toHaveValue('')
  })

  it('serializes online search submissions before React can disable the form', () => {
    window.api.researchSearchOnline = vi.fn().mockReturnValue(new Promise(() => undefined))
    render(<OnlineReferences />)
    const search = screen.getByRole('textbox', { name: 'Search Crossref and arXiv' })
    fireEvent.change(search, { target: { value: 'robot paper' } })
    const form = search.closest('form')
    expect(form).not.toBeNull()

    fireEvent.submit(form!)
    fireEvent.submit(form!)

    expect(window.api.researchSearchOnline).toHaveBeenCalledOnce()
  })

  it('keeps Zotero controls unavailable until project configuration is loaded', () => {
    window.api.researchLoadConfig = vi.fn().mockReturnValue(new Promise(() => undefined))
    window.api.zoteroLibraryTree = vi.fn().mockResolvedValue([])

    render(<ZoteroReferences />)

    expect(screen.getByText('Loading Zotero…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save research settings' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('textbox', { name: 'Search project and Zotero' })
    ).not.toBeInTheDocument()
  })

  it('keeps project health usable when Zotero is unavailable', async () => {
    useProjectStore.setState({
      bibEntries: [
        {
          key: 'local2026',
          type: 'article',
          title: 'Local paper',
          author: 'Ada Lovelace',
          year: '2026'
        }
      ]
    })
    window.api.researchLoadConfig = vi.fn().mockResolvedValue(config)
    window.api.scanCitations = vi.fn().mockResolvedValue([{ citekey: 'local2026', count: 2 }])
    window.api.zoteroLibraryTree = vi.fn().mockRejectedValue(new Error('Cannot connect to Zotero'))

    render(<ZoteroReferences />)

    const card = (await screen.findByText('Local paper')).closest('article')
    expect(card).toHaveTextContent('CITED ×2')
    expect(card).toHaveTextContent('Zotero unavailable')
    expect(card).not.toHaveTextContent('Not linked to Zotero')
  })

  it('reveals citation locations and jumps to the selected source line', async () => {
    useProjectStore.setState({
      bibEntries: [
        {
          key: 'local2026',
          type: 'article',
          title: 'Located paper',
          author: 'Ada Lovelace',
          year: '2026'
        }
      ]
    })
    useEditorStore.getState().openFileInTab('/project-a/main.tex', '\\cite{local2026}')
    window.api.researchLoadConfig = vi.fn().mockResolvedValue(config)
    window.api.scanCitations = vi.fn().mockResolvedValue([
      {
        citekey: 'local2026',
        count: 1,
        locations: [{ file: '/project-a/main.tex', line: 7 }]
      }
    ])
    window.api.zoteroLibraryTree = vi.fn().mockRejectedValue(new Error('Cannot connect to Zotero'))

    render(<ZoteroReferences />)

    fireEvent.click(await screen.findByRole('button', { name: 'CITED ×1' }))
    fireEvent.click(screen.getByRole('button', { name: 'main.tex:7' }))
    expect(useEditorStore.getState().pendingJump).toEqual({ line: 7, column: 1 })
  })

  it('surfaces possible duplicates and makes compile problems actionable', async () => {
    const onOpenProblems = vi.fn()
    const onOpenSubmission = vi.fn()
    useProjectStore.setState({
      bibEntries: [
        {
          key: 'first2026',
          type: 'article',
          title: 'Duplicate paper',
          author: 'Ada Lovelace',
          year: '2026',
          doi: '10.1000/duplicate'
        },
        {
          key: 'second2026',
          type: 'article',
          title: 'Duplicate paper copy',
          author: 'Ada Lovelace',
          year: '2026',
          doi: 'https://doi.org/10.1000/DUPLICATE'
        }
      ]
    })
    useCompileStore.setState({
      diagnostics: [{ file: '/project-a/main.tex', line: 4, severity: 'warning', message: 'Warn' }]
    })
    window.api.researchLoadConfig = vi.fn().mockResolvedValue(config)
    window.api.scanCitations = vi.fn().mockResolvedValue([])
    window.api.zoteroLibraryTree = vi.fn().mockRejectedValue(new Error('Cannot connect to Zotero'))

    render(<ZoteroReferences onOpenProblems={onOpenProblems} onOpenSubmission={onOpenSubmission} />)

    expect(await screen.findAllByText(/Possible duplicate:/)).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: '⚠ 1 compile problem' }))
    expect(onOpenProblems).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Submission check' }))
    expect(onOpenSubmission).toHaveBeenCalledOnce()
  })

  it('ignores a late Zotero load after the configured port changes', async () => {
    const firstConfig = deferred<typeof config>()
    window.api.researchLoadConfig = vi
      .fn()
      .mockReturnValueOnce(firstConfig.promise)
      .mockResolvedValueOnce(config)
    window.api.zoteroLibraryTree = vi
      .fn()
      .mockResolvedValueOnce(
        libraryTree([{ key: '/0/A', name: 'Old port', parentKey: null, itemCount: 1 }])
      )
      .mockResolvedValueOnce(
        libraryTree([{ key: '/0/B', name: 'New port', parentKey: null, itemCount: 2 }])
      )

    render(<ZoteroReferences />)
    await waitFor(() => expect(window.api.researchLoadConfig).toHaveBeenCalledOnce())
    act(() => {
      useSettingsStore.setState((state) => ({
        settings: { ...state.settings, zoteroPort: 23_120 }
      }))
    })

    expect(await screen.findByText('New port')).toBeInTheDocument()
    await act(async () => {
      firstConfig.resolve(config)
      await firstConfig.promise
    })
    expect(screen.queryByText('Old port')).not.toBeInTheDocument()
  })

  it('serializes Zotero search submissions before React can disable the form', async () => {
    window.api.researchLoadConfig = vi.fn().mockResolvedValue(config)
    window.api.zoteroLibraryTree = vi.fn().mockResolvedValue([])
    window.api.zoteroSearch = vi.fn().mockReturnValue(new Promise(() => undefined))
    render(<ZoteroReferences />)
    const search = await screen.findByRole('textbox', { name: 'Search project and Zotero' })
    fireEvent.change(search, { target: { value: 'robot paper' } })
    const form = search.closest('form')
    expect(form).not.toBeNull()

    fireEvent.submit(form!)
    fireEvent.submit(form!)

    expect(window.api.zoteroSearch).toHaveBeenCalledOnce()
  })

  it('uses the Chat command query in the unified project and Zotero filter', async () => {
    useProjectStore.setState({
      researchSearchQuery: 'diffusion policy',
      researchReferenceSource: 'project',
      bibEntries: [
        {
          key: 'diffusion2026',
          type: 'article',
          title: 'Diffusion Policy',
          author: 'Ada Lovelace',
          year: '2026'
        }
      ]
    })
    window.api.researchLoadConfig = vi.fn().mockResolvedValue(config)
    window.api.zoteroLibraryTree = vi.fn().mockResolvedValue([])
    render(<ReferencesPanel />)
    expect(await screen.findByRole('textbox', { name: 'Search project and Zotero' })).toHaveValue(
      'diffusion policy'
    )
  })

  it('renders only expanded collection branches and supports keyboard tree navigation', async () => {
    window.api.researchLoadConfig = vi.fn().mockResolvedValue(config)
    window.api.zoteroLibraryTree = vi.fn().mockResolvedValue(
      libraryTree([
        { key: '/0/PARENT', name: 'Parent', parentKey: null, itemCount: 2 },
        { key: '/0/CHILD', name: 'Child', parentKey: '/0/PARENT', itemCount: 1 }
      ])
    )

    render(<ZoteroReferences />)

    const parent = await screen.findByRole('treeitem', { name: /Parent/ })
    expect(parent).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('treeitem', { name: /Child/ })).not.toBeInTheDocument()

    fireEvent.keyDown(parent, { key: 'ArrowRight' })
    const child = screen.getByRole('treeitem', { name: /Child/ })
    expect(parent).toHaveAttribute('aria-expanded', 'true')

    fireEvent.keyDown(parent, { key: 'ArrowRight' })
    expect(child).toHaveFocus()
    fireEvent.keyDown(child, { key: 'ArrowLeft' })
    expect(parent).toHaveFocus()
  })

  it('does not offer sync for a collection that no longer exists in Zotero', async () => {
    window.api.researchLoadConfig = vi.fn().mockResolvedValue({
      ...config,
      zoteroCollection: '/0/DELETED',
      syncOnOpen: true
    })
    window.api.zoteroLibraryTree = vi
      .fn()
      .mockResolvedValue(
        libraryTree([{ key: '/0/CURRENT', name: 'Current papers', parentKey: null, itemCount: 2 }])
      )

    render(<ZoteroReferences />)

    const root = await screen.findByRole('treeitem', { name: /My Library/ })
    expect(root).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Synchronize selected collection' })).toBeDisabled()
    expect(
      screen.queryByRole('checkbox', { name: 'Keep synchronized when this project opens' })
    ).not.toBeInTheDocument()
  })

  it('bounds large collection trees and progressively reveals more rows', async () => {
    window.api.researchLoadConfig = vi.fn().mockResolvedValue(config)
    window.api.zoteroLibraryTree = vi.fn().mockResolvedValue(
      libraryTree(
        Array.from({ length: 250 }, (_, index) => ({
          key: `/0/C${index}`,
          name: `Collection ${String(index).padStart(3, '0')}`,
          parentKey: null,
          itemCount: index
        }))
      )
    )

    render(<ZoteroReferences />)

    await screen.findByRole('treeitem', { name: /Collection 000/ })
    expect(screen.getAllByRole('treeitem')).toHaveLength(201)
    fireEvent.click(screen.getByRole('button', { name: 'Show more collections (50)' }))
    expect(screen.getAllByRole('treeitem')).toHaveLength(251)
  })

  it('keeps malformed collection cycles finite and keyboard-accessible', async () => {
    window.api.researchLoadConfig = vi.fn().mockResolvedValue(config)
    window.api.zoteroLibraryTree = vi.fn().mockResolvedValue(
      libraryTree([
        { key: '/0/A', name: 'Cycle A', parentKey: '/0/B', itemCount: 1 },
        { key: '/0/B', name: 'Cycle B', parentKey: '/0/A', itemCount: 1 }
      ])
    )

    render(<ZoteroReferences />)

    const first = await screen.findByRole('treeitem', { name: /Cycle A/ })
    expect(screen.getAllByRole('treeitem')).toHaveLength(2)
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(screen.getAllByRole('treeitem')).toHaveLength(3)
    expect(screen.getByRole('treeitem', { name: /Cycle B/ })).not.toHaveAttribute('aria-expanded')
  })

  it('shows My Library and compares selected collection papers with the project', async () => {
    const selectedConfig = { ...config, zoteroCollection: '/0/PAPERS' }
    useProjectStore.setState({
      bibEntries: [
        {
          key: 'project2026',
          type: 'article',
          title: 'Project paper',
          author: 'Ada Lovelace',
          year: '2026'
        }
      ]
    })
    window.api.researchLoadConfig = vi.fn().mockResolvedValue(selectedConfig)
    window.api.scanCitations = vi.fn().mockResolvedValue([
      { citekey: 'project2026', count: 2 },
      { citekey: 'missing2026', count: 1 }
    ])
    window.api.zoteroLibraryTree = vi
      .fn()
      .mockResolvedValue(
        libraryTree([
          { key: '/0/PAPERS', name: 'Writing Papers', parentKey: null, itemCount: null }
        ])
      )
    window.api.zoteroCollectionItems = vi
      .fn()
      .mockImplementation(async (_collection: string, _offset?: number, limit?: number) => ({
        items:
          limit === 0
            ? []
            : [
                {
                  itemKey: 'ITEM0001',
                  citekey: 'project2026',
                  title: 'Project paper',
                  author: 'Ada Lovelace',
                  year: '2026',
                  type: 'journalArticle',
                  doi: null,
                  arxivId: null
                },
                {
                  itemKey: 'ITEM0002',
                  citekey: 'zotero2026',
                  title: 'Zotero-only paper',
                  author: 'Grace Hopper',
                  year: '2026',
                  type: 'conferencePaper',
                  doi: null,
                  arxivId: null
                }
              ],
        totalResults: 2,
        offset: 0,
        limit: limit ?? 50
      }))

    render(<ZoteroReferences />)

    expect(await screen.findByRole('treeitem', { name: /My Library.*438/ })).toBeInTheDocument()
    expect(screen.getByText(/1 cited · 1 bib · 1 issue/)).toBeInTheDocument()
    expect(screen.getByText(/1 missing bibliography/)).toBeInTheDocument()
    expect(await screen.findByText('2 papers')).toBeInTheDocument()
    expect(screen.getByText(/1 in project · 1 Zotero only/)).toBeInTheDocument()
    expect(screen.getByText('Project paper').closest('article')).toHaveTextContent('CITED ×2')
    expect(screen.getByText('Zotero-only paper').closest('article')).toHaveTextContent(
      'ZOTERO ONLY'
    )

    fireEvent.click(screen.getByRole('button', { name: 'Missing 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Find source' }))
    await waitFor(() => expect(window.api.zoteroSearch).toHaveBeenCalledWith('missing2026', 23_119))
  })

  it('previews the exact managed bibliography diff before collection sync', async () => {
    const selectedConfig = { ...config, zoteroCollection: '/0/PAPERS' }
    window.api.researchLoadConfig = vi.fn().mockResolvedValue(selectedConfig)
    window.api.zoteroLibraryTree = vi
      .fn()
      .mockResolvedValue(
        libraryTree([{ key: '/0/PAPERS', name: 'Writing Papers', parentKey: null, itemCount: 2 }])
      )
    window.api.zoteroCollectionItems = vi.fn().mockResolvedValue({
      items: [
        {
          itemKey: 'ITEM0001',
          citekey: 'same2026',
          title: 'Unchanged paper',
          author: 'Ada Lovelace',
          year: '2026',
          type: 'journalArticle',
          doi: null,
          arxivId: null
        },
        {
          itemKey: 'ITEM0002',
          citekey: 'new2026',
          title: 'New paper',
          author: 'Grace Hopper',
          year: '2026',
          type: 'conferencePaper',
          doi: null,
          arxivId: null
        }
      ],
      totalResults: 2,
      offset: 0,
      limit: 100
    })
    window.api.parseBibFile = vi.fn().mockResolvedValue([
      { key: 'same2026', type: 'article', title: '', author: '', year: '' },
      { key: 'removed2025', type: 'article', title: '', author: '', year: '' }
    ])
    window.api.zoteroSyncCollection = vi.fn().mockResolvedValue({
      filePath: '/project-a/zotero.bib',
      bytesWritten: 100,
      entryCount: 2
    })
    window.api.findBibInProject = vi.fn().mockResolvedValue([])

    render(<ZoteroReferences />)
    const sync = await screen.findByRole('button', { name: 'Synchronize selected collection' })
    fireEvent.click(sync)

    const preview = await screen.findByRole('dialog', { name: 'Zotero sync preview' })
    expect(preview).toHaveTextContent('New+1')
    expect(preview).toHaveTextContent('Removed−1')
    expect(preview).toHaveTextContent('Unchanged1')
    expect(preview).toHaveTextContent('Target: zotero.bib')

    fireEvent.click(screen.getByRole('button', { name: 'Sync' }))
    await waitFor(() =>
      expect(window.api.zoteroSyncCollection).toHaveBeenCalledWith(
        '/0/PAPERS',
        '/project-a/zotero.bib',
        23_119
      )
    )
    expect(await screen.findByText('Synchronized 2 entries to zotero.bib.')).toBeInTheDocument()
  })

  it('blocks collection sync when the managed bibliography cannot be parsed', async () => {
    const selectedConfig = { ...config, zoteroCollection: '/0/PAPERS' }
    window.api.researchLoadConfig = vi.fn().mockResolvedValue(selectedConfig)
    window.api.zoteroLibraryTree = vi
      .fn()
      .mockResolvedValue(
        libraryTree([{ key: '/0/PAPERS', name: 'Writing Papers', parentKey: null, itemCount: 1 }])
      )
    window.api.zoteroCollectionItems = vi.fn().mockResolvedValue({
      items: [
        {
          itemKey: 'ITEM0001',
          citekey: 'paper2026',
          title: 'Paper',
          author: 'Ada Lovelace',
          year: '2026',
          type: 'journalArticle',
          doi: null,
          arxivId: null
        }
      ],
      totalResults: 1,
      offset: 0,
      limit: 100
    })
    window.api.parseBibFile = vi.fn().mockRejectedValue(new Error('Invalid BibTeX'))
    window.api.zoteroSyncCollection = vi.fn()

    render(<ZoteroReferences />)
    fireEvent.click(await screen.findByRole('button', { name: 'Synchronize selected collection' }))

    expect(await screen.findByText('Invalid BibTeX')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Zotero sync preview' })).not.toBeInTheDocument()
    expect(window.api.zoteroSyncCollection).not.toHaveBeenCalled()
  })

  it('keeps Online as a secondary view and returns to the unified local manager', async () => {
    window.api.researchLoadConfig = vi.fn().mockResolvedValue(config)
    window.api.zoteroLibraryTree = vi.fn().mockResolvedValue([])
    useProjectStore.setState({ researchReferenceSource: 'online' })
    render(<ReferencesPanel />)

    expect(screen.getByRole('textbox', { name: 'Search Crossref and arXiv' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Online' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to local references' }))
    expect(
      await screen.findByRole('textbox', { name: 'Search project and Zotero' })
    ).toBeInTheDocument()
  })

  it('offers Online only after a completed local search has no matches', async () => {
    window.api.researchLoadConfig = vi.fn().mockResolvedValue(config)
    window.api.zoteroLibraryTree = vi.fn().mockResolvedValue([])
    window.api.zoteroSearch = vi.fn().mockResolvedValue([])
    render(<ReferencesPanel />)

    const search = await screen.findByRole('textbox', { name: 'Search project and Zotero' })
    expect(
      screen.queryByRole('button', { name: 'Search Crossref / arXiv' })
    ).not.toBeInTheDocument()
    fireEvent.change(search, { target: { value: 'unmatched paper' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    const online = await screen.findByRole('button', { name: 'Search Crossref / arXiv' })
    fireEvent.click(online)
    expect(screen.getByRole('textbox', { name: 'Search Crossref and arXiv' })).toHaveValue(
      'unmatched paper'
    )
  })

  it('keeps project citation groups available as a secondary local view', async () => {
    useProjectStore.setState({
      bibEntries: [
        {
          key: 'grouped2026',
          type: 'article',
          title: 'Grouped paper',
          author: 'Ada Lovelace',
          year: '2026'
        }
      ]
    })
    window.api.researchLoadConfig = vi.fn().mockResolvedValue(config)
    window.api.zoteroLibraryTree = vi.fn().mockResolvedValue([])
    render(<ReferencesPanel />)

    fireEvent.click(await screen.findByRole('button', { name: 'Project citation groups' }))
    expect(screen.getByText('Project citation groups')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Filter citations...')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to local references' }))
    expect(
      await screen.findByRole('textbox', { name: 'Search project and Zotero' })
    ).toBeInTheDocument()
  })

  it('adds a Project reference to Chat without inserting a citation', async () => {
    const onAddToChat = vi.fn()
    useProjectStore.setState({
      researchReferenceSource: 'project',
      bibEntries: [
        {
          key: 'project2026',
          type: 'article',
          title: 'Project Paper',
          author: 'Ada Lovelace and Grace Hopper',
          year: '2026'
        }
      ]
    })
    window.api.researchLoadConfig = vi.fn().mockResolvedValue(config)
    window.api.zoteroLibraryTree = vi.fn().mockResolvedValue([])

    render(<ReferencesPanel onAddToChat={onAddToChat} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add Project Paper to Chat' }))

    expect(onAddToChat).toHaveBeenCalledWith({
      source: 'project',
      citekey: 'project2026',
      metadata: {
        title: 'Project Paper',
        authors: ['Ada Lovelace', 'Grace Hopper'],
        year: '2026',
        type: 'article'
      }
    })
  })

  it('uses the same Online payload for Add to Chat and reports cancelled citation insertion', async () => {
    const reference = {
      source: 'crossref' as const,
      id: 'online-paper',
      title: 'Online Paper',
      authors: ['Ada Lovelace'],
      year: '2026',
      type: 'article'
    }
    const onAddToChat = vi.fn()
    window.api.researchSearchOnline = vi.fn().mockResolvedValue([reference])
    vi.spyOn(referenceActions, 'addReferenceAtCursor').mockResolvedValue(false)
    render(<OnlineReferences onAddToChat={onAddToChat} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Search Crossref and arXiv' }), {
      target: { value: 'online paper' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    const addToChat = await screen.findByRole('button', { name: 'Add Online Paper to Chat' })
    fireEvent.click(addToChat)

    expect(onAddToChat).toHaveBeenCalledWith({ source: 'online', reference })
    expect(referenceActions.addReferenceAtCursor).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Add & cite' }))
    expect(
      await screen.findByText(
        'Added Online Paper to the project bibliography, but the editor changed before citation insertion.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText(/and inserted its citation/)).not.toBeInTheDocument()
  })

  it('uses the same Zotero payload for Add to Chat and reports cancelled citation insertion', async () => {
    const item = {
      citekey: 'zotero2026',
      title: 'Zotero Paper',
      author: 'Ada Lovelace and Grace Hopper',
      year: '2026',
      type: 'article'
    }
    const onAddToChat = vi.fn()
    window.api.researchLoadConfig = vi.fn().mockResolvedValue(config)
    window.api.zoteroLibraryTree = vi.fn().mockResolvedValue([])
    window.api.zoteroSearch = vi.fn().mockResolvedValue([item])
    vi.spyOn(referenceActions, 'addReferenceAtCursor').mockResolvedValue(false)
    render(<ZoteroReferences onAddToChat={onAddToChat} />)

    const search = await screen.findByRole('textbox', { name: 'Search project and Zotero' })
    fireEvent.change(search, { target: { value: 'zotero paper' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    const addToChat = await screen.findByRole('button', { name: 'Add Zotero Paper to Chat' })
    fireEvent.click(addToChat)

    expect(onAddToChat).toHaveBeenCalledWith({
      source: 'zotero',
      citekey: 'zotero2026',
      port: 23_119,
      metadata: {
        title: 'Zotero Paper',
        authors: ['Ada Lovelace', 'Grace Hopper'],
        year: '2026',
        type: 'article'
      }
    })
    expect(referenceActions.addReferenceAtCursor).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Add & cite' }))
    expect(
      await screen.findByText(
        'Added @zotero2026 to the project bibliography, but the editor changed before citation insertion.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText(/and inserted its citation/)).not.toBeInTheDocument()
  })
})

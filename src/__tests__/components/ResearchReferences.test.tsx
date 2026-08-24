import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OnlineReferences } from '../../renderer/components/research/OnlineReferences'
import { ReferencesPanel } from '../../renderer/components/research/ReferencesPanel'
import { ZoteroReferences } from '../../renderer/components/research/ZoteroReferences'
import * as referenceActions from '../../renderer/components/research/referenceActions'
import { TEXTEX_ZOTERO_COLLECTION_MIME } from '../../renderer/components/research/referenceActions'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'

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

describe('Research reference sources', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useProjectStore.setState({
      projectRoot: '/project-a',
      researchSearchQuery: '',
      researchReferenceSource: 'project'
    })
    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, zoteroPort: 23_119 }
    }))
  })

  it('ignores a late Zotero load from the previous project', async () => {
    const firstConfig = deferred<typeof config>()
    window.api.researchLoadConfig = vi
      .fn()
      .mockReturnValueOnce(firstConfig.promise)
      .mockResolvedValueOnce(config)
    window.api.zoteroCollections = vi
      .fn()
      .mockResolvedValueOnce([
        { key: '/0/A', name: 'Project A papers', parentKey: null, itemCount: 1 }
      ])
      .mockResolvedValueOnce([
        { key: '/0/B', name: 'Project B papers', parentKey: null, itemCount: 2 }
      ])

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
    window.api.zoteroCollections = vi.fn().mockResolvedValue([])

    render(<ZoteroReferences />)

    expect(screen.getByText('Loading Zotero…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save research settings' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Search Zotero library' })).not.toBeInTheDocument()
  })

  it('ignores a late Zotero load after the configured port changes', async () => {
    const firstConfig = deferred<typeof config>()
    window.api.researchLoadConfig = vi
      .fn()
      .mockReturnValueOnce(firstConfig.promise)
      .mockResolvedValueOnce(config)
    window.api.zoteroCollections = vi
      .fn()
      .mockResolvedValueOnce([{ key: '/0/A', name: 'Old port', parentKey: null, itemCount: 1 }])
      .mockResolvedValueOnce([{ key: '/0/B', name: 'New port', parentKey: null, itemCount: 2 }])

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
    window.api.zoteroCollections = vi.fn().mockResolvedValue([])
    window.api.zoteroSearch = vi.fn().mockReturnValue(new Promise(() => undefined))
    render(<ZoteroReferences />)
    const search = await screen.findByRole('textbox', { name: 'Search Zotero library' })
    fireEvent.change(search, { target: { value: 'robot paper' } })
    const form = search.closest('form')
    expect(form).not.toBeNull()

    fireEvent.submit(form!)
    fireEvent.submit(form!)

    expect(window.api.zoteroSearch).toHaveBeenCalledOnce()
  })

  it('uses the Chat command query in project and Zotero reference filters', async () => {
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
    const { unmount } = render(<ReferencesPanel />)
    expect(screen.getByPlaceholderText('Filter citations...')).toHaveValue('diffusion policy')
    unmount()

    window.api.researchLoadConfig = vi.fn().mockResolvedValue(config)
    window.api.zoteroCollections = vi.fn().mockResolvedValue([])
    useProjectStore.getState().setResearchReferenceSource('zotero')
    render(<ReferencesPanel />)
    expect(await screen.findByRole('textbox', { name: 'Search Zotero library' })).toHaveValue(
      'diffusion policy'
    )
  })

  it('renders only expanded collection branches and supports keyboard tree navigation', async () => {
    window.api.researchLoadConfig = vi.fn().mockResolvedValue(config)
    window.api.zoteroCollections = vi.fn().mockResolvedValue([
      { key: '/0/PARENT', name: 'Parent', parentKey: null, itemCount: 2 },
      { key: '/0/CHILD', name: 'Child', parentKey: '/0/PARENT', itemCount: 1 }
    ])

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

  it('bounds large collection trees and progressively reveals more rows', async () => {
    window.api.researchLoadConfig = vi.fn().mockResolvedValue(config)
    window.api.zoteroCollections = vi.fn().mockResolvedValue(
      Array.from({ length: 250 }, (_, index) => ({
        key: `/0/C${index}`,
        name: `Collection ${String(index).padStart(3, '0')}`,
        parentKey: null,
        itemCount: index
      }))
    )

    render(<ZoteroReferences />)

    await screen.findByRole('treeitem', { name: /Collection 000/ })
    expect(screen.getAllByRole('treeitem')).toHaveLength(200)
    fireEvent.click(screen.getByRole('button', { name: 'Show more collections (50)' }))
    expect(screen.getAllByRole('treeitem')).toHaveLength(250)
  })

  it('keeps malformed collection cycles finite and keyboard-accessible', async () => {
    window.api.researchLoadConfig = vi.fn().mockResolvedValue(config)
    window.api.zoteroCollections = vi.fn().mockResolvedValue([
      { key: '/0/A', name: 'Cycle A', parentKey: '/0/B', itemCount: 1 },
      { key: '/0/B', name: 'Cycle B', parentKey: '/0/A', itemCount: 1 }
    ])

    render(<ZoteroReferences />)

    const first = await screen.findByRole('treeitem', { name: /Cycle A/ })
    expect(screen.getAllByRole('treeitem')).toHaveLength(1)
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(screen.getAllByRole('treeitem')).toHaveLength(2)
    expect(screen.getByRole('treeitem', { name: /Cycle B/ })).not.toHaveAttribute('aria-expanded')
  })

  it('shows and uses the configured Zotero bibliography target for collection imports', async () => {
    const customConfig = { ...config, zoteroFile: 'bibliography/zotero-managed.bib' }
    window.api.researchLoadConfig = vi.fn().mockResolvedValue(customConfig)
    window.api.zoteroSyncCollection = vi.fn().mockResolvedValue({ entryCount: 3 })
    window.api.researchSaveConfig = vi.fn().mockResolvedValue(customConfig)
    window.api.findBibInProject = vi.fn().mockResolvedValue([])
    render(<ReferencesPanel />)

    const payload = JSON.stringify({
      collection: { key: '/0/PAPERS', name: 'Papers', parentKey: null, itemCount: 3 },
      port: 23_119
    })
    fireEvent.drop(screen.getByRole('tab', { name: 'Project' }), {
      dataTransfer: {
        getData: (type: string) => (type === TEXTEX_ZOTERO_COLLECTION_MIME ? payload : '')
      }
    })

    expect(await screen.findByText('bibliography/zotero-managed.bib')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))

    await waitFor(() =>
      expect(window.api.zoteroSyncCollection).toHaveBeenCalledWith(
        '/0/PAPERS',
        '/project-a/bibliography/zotero-managed.bib',
        23_119
      )
    )
  })

  it('connects each reference source tab to the active tab panel', async () => {
    useProjectStore.setState({ researchReferenceSource: 'online' })
    render(<ReferencesPanel />)

    for (const source of ['project', 'zotero', 'online'] as const) {
      const tab = screen.getByRole('tab', {
        name: `${source[0].toUpperCase()}${source.slice(1)}`
      })
      expect(tab).toHaveAttribute('id', `reference-source-tab-${source}`)
      expect(tab).toHaveAttribute('aria-controls', `reference-source-panel-${source}`)
    }
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      'reference-source-tab-online'
    )
  })

  it('adds a Project reference to Chat without inserting a citation', () => {
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

    render(<ReferencesPanel onAddToChat={onAddToChat} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Project Paper to Chat' }))

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
    window.api.zoteroCollections = vi.fn().mockResolvedValue([])
    window.api.zoteroSearch = vi.fn().mockResolvedValue([item])
    vi.spyOn(referenceActions, 'addReferenceAtCursor').mockResolvedValue(false)
    render(<ZoteroReferences onAddToChat={onAddToChat} />)

    const search = await screen.findByRole('textbox', { name: 'Search Zotero library' })
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

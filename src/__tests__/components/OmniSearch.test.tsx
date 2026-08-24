import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultUserSettings } from '../../shared/defaultSettings'
import { OmniSearch } from '../../renderer/components/OmniSearch'
import i18n from '../../renderer/i18n'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useNotificationStore } from '../../renderer/store/useNotificationStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { openProject } from '../../renderer/utils/openProject'
import { addReferenceAtCursor } from '../../renderer/components/research/referenceActions'

vi.mock('../../renderer/utils/openProject', () => ({
  openProject: vi.fn()
}))

vi.mock('../../renderer/components/research/referenceActions', () => ({
  addReferenceAtCursor: vi.fn()
}))

const recentProjects = [
  {
    path: '/projects/alpha',
    name: 'alpha',
    title: 'Alpha Paper',
    tag: 'omni-marker',
    lastOpened: '2026-08-24T12:00:00.000Z'
  },
  {
    path: '/projects/beta',
    name: 'beta',
    title: 'Beta Notes',
    tag: 'omni-marker',
    lastOpened: '2026-08-23T12:00:00.000Z'
  }
]

describe('OmniSearch accessibility', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18n.changeLanguage('en')
    useNotificationStore.getState().clearNotifications()
    useEditorStore.getState().resetEditor()
    useProjectStore.setState({ projectRoot: null, bibEntries: [], projectIndex: null })
    vi.mocked(window.api.loadSettings).mockResolvedValue({
      ...createDefaultUserSettings(),
      recentProjects
    })
    vi.mocked(openProject).mockResolvedValue({
      generation: 1,
      projectPath: '/projects/alpha'
    })
    vi.mocked(addReferenceAtCursor).mockResolvedValue(true)
  })

  it('connects the home combobox to its listbox and active option', async () => {
    render(<OmniSearch />)
    const input = screen.getByRole('combobox', { name: 'Search Home' })

    fireEvent.change(input, { target: { value: 'omni-marker' } })

    const options = await screen.findAllByRole('option')
    const listbox = screen.getByRole('listbox', { name: 'Home results' })
    expect(options).toHaveLength(2)
    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(input).toHaveAttribute('aria-controls', listbox.id)
    expect(input).toHaveAttribute('aria-activedescendant', options[0].id)
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('2 results')

    fireEvent.keyDown(input, { key: 'End' })
    expect(input).toHaveAttribute('aria-activedescendant', options[1].id)
    expect(options[1]).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(input, { key: 'Home' })
    expect(input).toHaveAttribute('aria-activedescendant', options[0].id)
  })

  it('uses multiselect listbox semantics for citations', async () => {
    useProjectStore.setState({
      projectRoot: '/projects/paper',
      bibEntries: [
        { key: 'alpha', type: 'article', title: 'Alpha Paper', author: 'A', year: '2025' },
        { key: 'beta', type: 'article', title: 'Beta Paper', author: 'B', year: '2026' }
      ]
    })
    render(<OmniSearch />)
    const input = screen.getByRole('combobox', { name: 'Search Citations' })

    fireEvent.change(input, { target: { value: 'paper' } })

    const listbox = await screen.findByRole('listbox', { name: 'Citations results' })
    const options = screen.getAllByRole('option')
    expect(listbox).toHaveAttribute('aria-multiselectable', 'true')
    expect(input).toHaveAttribute('aria-activedescendant', options[0].id)
    expect(options[0]).toHaveAttribute('aria-selected', 'false')

    fireEvent.keyDown(input, { key: 'End' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(input).toHaveAttribute('aria-activedescendant', options[1].id)
    expect(options[1]).toHaveAttribute('aria-selected', 'true')
  })

  it('announces an empty result set without an active descendant', async () => {
    useProjectStore.setState({ projectRoot: '/projects/paper', bibEntries: [] })
    render(<OmniSearch />)
    const input = screen.getByRole('combobox', { name: 'Search Citations' })

    fireEvent.change(input, { target: { value: 'missing' } })

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('No results'))
    expect(screen.getByRole('listbox', { name: 'Citations results' })).toBeInTheDocument()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(input).not.toHaveAttribute('aria-activedescendant')
  })

  it('exposes the PDF controls as a labelled combobox dialog popup', async () => {
    useProjectStore.setState({ projectRoot: '/projects/paper' })
    render(<OmniSearch />)

    const modeButton = screen.getByRole('button', { name: 'Search mode: Citations' })
    fireEvent.click(modeButton)
    const menu = screen.getByRole('menu', { name: 'Choose search mode' })
    expect(modeButton).toHaveAttribute('aria-controls', menu.id)
    fireEvent.click(screen.getByRole('menuitemradio', { name: /PDF/ }))

    const input = screen.getByRole('combobox', { name: 'Search PDF' })
    fireEvent.change(input, { target: { value: 'theorem' } })

    const popup = await screen.findByRole('dialog', { name: 'PDF results' })
    expect(input).toHaveAttribute('aria-haspopup', 'dialog')
    expect(input).toHaveAttribute('aria-controls', popup.id)
    expect(input).not.toHaveAttribute('aria-activedescendant')
  })

  it('opens and navigates the mode menu from the keyboard', async () => {
    useProjectStore.setState({ projectRoot: '/projects/paper' })
    render(<OmniSearch />)

    const modeButton = screen.getByRole('button', { name: 'Search mode: Citations' })
    modeButton.focus()

    fireEvent.click(modeButton)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(modeButton, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    fireEvent.keyDown(modeButton, { key: 'ArrowDown' })

    const items = await screen.findAllByRole('menuitemradio')
    await waitFor(() => expect(items[0]).toHaveFocus())

    fireEvent.keyDown(items[0], { key: 'End' })
    expect(items.at(-1)).toHaveFocus()

    fireEvent.keyDown(items.at(-1)!, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(modeButton).toHaveFocus()
  })

  it('keeps TeX navigation controls outside the results listbox', async () => {
    useProjectStore.setState({ projectRoot: '/projects/paper' })
    useEditorStore
      .getState()
      .openFileInTab('/projects/paper/main.tex', 'alpha result\nbeta\nsecond alpha result')
    render(<OmniSearch />)

    fireEvent.click(screen.getByRole('button', { name: 'Search mode: Citations' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /TeX/ }))
    const input = screen.getByRole('combobox', { name: 'Search TeX' })
    fireEvent.change(input, { target: { value: 'alpha' } })

    const listbox = await screen.findByRole('listbox', { name: 'TeX results' })
    const previous = screen.getByRole('button', { name: 'Previous' })
    const next = screen.getByRole('button', { name: 'Next' })
    expect(screen.getAllByRole('option')).toHaveLength(2)
    expect(listbox).not.toContainElement(previous)
    expect(listbox).not.toContainElement(next)
  })

  it('keeps a failed recent project and publishes a retry notification', async () => {
    vi.mocked(openProject).mockRejectedValueOnce(new Error('Folder unavailable'))
    render(<OmniSearch />)
    const input = screen.getByRole('combobox', { name: 'Search Home' })
    fireEvent.change(input, { target: { value: 'Alpha' } })
    fireEvent.click(await screen.findByRole('option', { name: /Alpha Paper/ }))

    await waitFor(() => expect(openProject).toHaveBeenCalledWith('/projects/alpha'))
    await waitFor(() => expect(useNotificationStore.getState().notifications).toHaveLength(1))
    expect(window.api.removeRecentProject).not.toHaveBeenCalled()
    expect(useNotificationStore.getState().notifications[0]).toMatchObject({
      tone: 'error',
      action: { label: 'Retry' }
    })
  })

  it('keeps online results open and warns when the citation insertion becomes stale', async () => {
    const reference = {
      source: 'crossref' as const,
      id: '10.1000/example',
      title: 'A Current Paper',
      authors: ['Ada Lovelace'],
      year: '2026',
      type: 'article',
      doi: '10.1000/example'
    }
    useProjectStore.setState({ projectRoot: '/projects/paper' })
    vi.mocked(window.api.researchSearchOnline).mockResolvedValueOnce([reference])
    vi.mocked(addReferenceAtCursor).mockResolvedValueOnce(false)
    render(<OmniSearch />)

    fireEvent.click(screen.getByRole('button', { name: 'Search mode: Citations' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Online papers/ }))
    const input = screen.getByRole('combobox', { name: 'Search Online papers' })
    fireEvent.change(input, { target: { value: 'current paper' } })
    fireEvent.click(await screen.findByRole('option', { name: /A Current Paper/ }))

    await waitFor(() =>
      expect(addReferenceAtCursor).toHaveBeenCalledWith({ source: 'online', reference })
    )
    expect(input).toHaveValue('current paper')
    expect(screen.getByRole('option', { name: /A Current Paper/ })).toBeInTheDocument()
    expect(useNotificationStore.getState().notifications).toContainEqual(
      expect.objectContaining({
        id: 'omni-search:reference-insert-skipped',
        tone: 'warning'
      })
    )
  })
})

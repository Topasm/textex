import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReferenceRow } from '../../renderer/components/research/ReferenceRow'
import { buildReferenceHealth } from '../../renderer/services/referenceHealth'
import { buildReferenceRows } from '../../renderer/services/referenceListModel'
import { invalidateZoteroItemDetails } from '../../renderer/services/zoteroItemDetailCache'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import type { BibEntry, ZoteroCollectionItem } from '../../shared/types'

vi.mock('../../renderer/components/research/CitationEvidencePanel', () => ({
  default: () => <textarea aria-label="Evidence excerpt" />
}))

const entry: BibEntry = {
  key: 'zhang2025laps',
  type: 'article',
  title: 'Latent Action Primitive Segmentation',
  author: 'Zhang, Jiajie',
  year: '2025'
}

const item: ZoteroCollectionItem = {
  itemKey: 'ABCD2345',
  citekey: 'deng2025sbd',
  title: 'Open-World Skill Discovery',
  author: 'Deng, Jingwen',
  year: '2025',
  type: 'conferencePaper',
  doi: null,
  arxivId: null
}

function rowFor(source: 'project' | 'zotero') {
  const rows = buildReferenceRows({
    health: buildReferenceHealth(source === 'project' ? [entry] : [], [], []),
    inventory: source === 'zotero' ? [item] : [],
    searchResults: [],
    query: '',
    filter: 'all',
    sort: 'natural',
    zoteroReady: true
  })
  return rows[0]
}

function renderRow(source: 'project' | 'zotero' = 'zotero', expanded = false) {
  const handlers = {
    onToggleExpanded: vi.fn(),
    onCite: vi.fn(),
    onAddToBibliography: vi.fn(),
    onAddAndCite: vi.fn(),
    onOpenInZotero: vi.fn(),
    onOpenLocation: vi.fn(),
    onFindSource: vi.fn(),
    onAddToChat: vi.fn()
  }
  const view = render(
    <ReferenceRow
      row={rowFor(source)}
      projectRoot="/project"
      port={23_119}
      expanded={expanded}
      busy={false}
      zoteroState="ready"
      {...handlers}
    />
  )
  return { ...handlers, view, row: screen.getByRole('article') }
}

describe('ReferenceRow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invalidateZoteroItemDetails()
    useEditorStore.getState().resetEditor()
    vi.mocked(window.api.zoteroItemDetail).mockResolvedValue({
      itemKey: 'ABCD2345',
      abstract: 'We discover reusable skills from unsegmented video.',
      publication: 'ICRA',
      url: null
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('selects on click without touching the document or the bibliography', () => {
    const { row, onToggleExpanded, onAddAndCite, onCite } = renderRow()

    fireEvent.click(row)

    expect(onToggleExpanded).toHaveBeenCalledWith(rowFor('zotero').id)
    expect(onAddAndCite).not.toHaveBeenCalled()
    expect(onCite).not.toHaveBeenCalled()
    expect(useEditorStore.getState().pendingInsertText).toBeNull()
  })

  it('opens the item in Zotero on a double click', () => {
    const { row, onOpenInZotero } = renderRow()

    fireEvent.doubleClick(row)

    expect(onOpenInZotero).toHaveBeenCalledOnce()
  })

  it('hides every writing action until the row is expanded', () => {
    renderRow()

    expect(screen.queryByRole('button', { name: /cite/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /bibliography/i })).not.toBeInTheDocument()
  })

  it('offers add, add-and-cite and open-in-Zotero from the context menu', () => {
    const { row, onAddToBibliography, onOpenInZotero } = renderRow()

    fireEvent.contextMenu(row, { clientX: 20, clientY: 30 })
    const menu = screen.getByRole('menu')

    expect(screen.getByRole('menuitem', { name: 'Insert citation' })).toBeDisabled()
    fireEvent.click(within(menu, 'Add to bibliography'))
    expect(onAddToBibliography).toHaveBeenCalledOnce()

    fireEvent.contextMenu(row, { clientX: 20, clientY: 30 })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open in Zotero' }))
    expect(onOpenInZotero).toHaveBeenCalledOnce()
  })

  it('enables Insert citation only for a reference the project already has', () => {
    renderRow('project')
    fireEvent.contextMenu(screen.getByRole('article'), { clientX: 4, clientY: 4 })

    expect(screen.getByRole('menuitem', { name: 'Insert citation' })).toBeEnabled()
    expect(screen.getByRole('menuitem', { name: 'Add to bibliography' })).toBeDisabled()
  })

  it('keeps secondary actions available through the visible More button', () => {
    const { onAddToBibliography, onToggleExpanded } = renderRow('zotero', true)
    fireEvent.click(screen.getByRole('button', { name: `Actions for ${item.title}` }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add to bibliography' }))
    expect(onAddToBibliography).toHaveBeenCalledOnce()
    expect(onToggleExpanded).not.toHaveBeenCalled()
  })

  it('loads the abstract once when expanded and reuses the cache afterwards', async () => {
    const view = renderRow('zotero', true).view

    expect(
      await screen.findByText('We discover reusable skills from unsegmented video.')
    ).toBeInTheDocument()
    expect(window.api.zoteroItemDetail).toHaveBeenCalledWith('ABCD2345', 23_119)

    await act(async () => {
      view.unmount()
    })
    renderRow('zotero', true)

    await waitFor(() =>
      expect(
        screen.getByText('We discover reusable skills from unsegmented video.')
      ).toBeInTheDocument()
    )
    expect(window.api.zoteroItemDetail).toHaveBeenCalledOnce()
  })
})

function within(menu: HTMLElement, name: string): HTMLElement {
  const item = [...menu.querySelectorAll('[role="menuitem"]')].find(
    (candidate) => candidate.textContent?.trim() === name
  )
  if (!(item instanceof HTMLElement)) throw new Error(`No menu item named ${name}`)
  return item
}

it('connects a citation to its current passage and hides stale line excerpts', () => {
  useEditorStore.getState().resetEditor()
  useEditorStore
    .getState()
    .openFileInTab('/project/main.tex', 'A supported claim \\cite{zhang2025laps}.')
  const row = {
    ...rowFor('project'),
    citationCount: 1,
    citationLocations: [{ file: '/project/main.tex', line: 1 }]
  }
  const open = vi.fn()
  render(
    <ReferenceRow
      row={row}
      projectRoot="/project"
      port={23119}
      expanded
      busy={false}
      zoteroState="ready"
      onToggleExpanded={vi.fn()}
      onCite={vi.fn()}
      onAddToBibliography={vi.fn()}
      onAddAndCite={vi.fn()}
      onOpenInZotero={vi.fn()}
      onOpenLocation={open}
      onFindSource={vi.fn()}
    />
  )
  expect(screen.getByText('A supported claim \\cite{zhang2025laps}.')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: /main.tex:1/ }))
  expect(open).toHaveBeenCalledWith({ file: '/project/main.tex', line: 1 })
  act(() => {
    useEditorStore.getState().updateActiveDocument('Unrelated replacement')
  })
  expect(screen.queryByText('A supported claim \\cite{zhang2025laps}.')).not.toBeInTheDocument()
  expect(screen.queryByText('Unrelated replacement')).not.toBeInTheDocument()
})

it('keeps evidence text selection and typing independent of the reference row actions', async () => {
  const { row, onToggleExpanded } = renderRow('project', true)
  fireEvent.click(screen.getByRole('button', { name: 'Link PDF evidence' }))
  const excerpt = await screen.findByRole('textbox', { name: 'Evidence excerpt' })
  expect(row).toHaveAttribute('draggable', 'false')
  expect(fireEvent.keyDown(excerpt, { key: ' ' })).toBe(true)
  expect(fireEvent.keyDown(excerpt, { key: 'Enter' })).toBe(true)
  expect(fireEvent.contextMenu(excerpt)).toBe(true)
  expect(onToggleExpanded).not.toHaveBeenCalled()
})

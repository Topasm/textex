import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import CitationTooltip from '../../renderer/components/CitationTooltip'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { loadZoteroInventory } from '../../renderer/services/zoteroInventoryCache'
import { loadZoteroItemDetail } from '../../renderer/services/zoteroItemDetailCache'

vi.mock('../../renderer/services/zoteroInventoryCache', () => ({ loadZoteroInventory: vi.fn() }))
vi.mock('../../renderer/services/zoteroItemDetailCache', () => ({ loadZoteroItemDetail: vi.fn() }))

const entry = {
  key: 'paper',
  title: 'Project title',
  author: 'Project author',
  year: '2025',
  type: 'article'
}
const item = {
  itemKey: 'ABCD2345',
  citekey: 'paper',
  title: 'Zotero title',
  author: 'Zotero author',
  year: '2026',
  type: 'journalArticle',
  doi: null,
  arxivId: null
}
const detail = {
  itemKey: item.itemKey,
  abstract: 'The library abstract.',
  publication: 'Library journal',
  url: 'https://example.org/paper'
}
const show = () =>
  render(
    <CitationTooltip
      entries={[entry]}
      anchorRect={new DOMRect(50, 100, 30, 20)}
      containerRect={new DOMRect(0, 0, 800, 600)}
      pinned
      onClose={vi.fn()}
    />
  )

beforeEach(() => {
  useProjectStore.setState({ projectRoot: '/project' })
  useSettingsStore.setState((state) => ({
    settings: { ...state.settings, zoteroEnabled: true, zoteroPort: 23119 }
  }))
  vi.mocked(loadZoteroInventory).mockReset().mockResolvedValue([item])
  vi.mocked(loadZoteroItemDetail).mockReset().mockResolvedValue(detail)
  window.api.zoteroOpenItem = vi.fn().mockResolvedValue({ success: true })
  window.api.openExternal = vi.fn().mockResolvedValue({ success: true })
})
afterEach(cleanup)

it('shows Zotero metadata and abstract, and opens its item through DesktopApi', async () => {
  show()
  expect(screen.getByText('Project title')).toBeInTheDocument()
  expect(await screen.findByText('The library abstract.')).toBeVisible()
  expect(screen.getByText('Zotero title')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Open in Zotero' }))
  expect(window.api.zoteroOpenItem).toHaveBeenCalledWith(item.itemKey, 23119)
  fireEvent.click(screen.getByRole('button', { name: 'Check original source' }))
  expect(window.api.openExternal).toHaveBeenCalledWith(detail.url)
})

it('retains project details when Zotero is unavailable', async () => {
  vi.mocked(loadZoteroInventory).mockRejectedValue(new Error('offline'))
  show()
  expect(await screen.findByText(/Zotero is unavailable/)).toBeVisible()
  expect(screen.getByText('Project title')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Open in Zotero' })).not.toBeInTheDocument()
})

it('does not offer unsafe Zotero source URLs', async () => {
  vi.mocked(loadZoteroItemDetail).mockResolvedValue({ ...detail, url: 'javascript:alert(1)' })
  show()
  await screen.findByText('The library abstract.')
  expect(screen.queryByRole('button', { name: 'Check original source' })).not.toBeInTheDocument()
})

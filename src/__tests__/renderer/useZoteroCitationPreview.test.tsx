import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useZoteroCitationPreview } from '../../renderer/hooks/preview/useZoteroCitationPreview'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'
import { loadZoteroInventory } from '../../renderer/services/zoteroInventoryCache'
import { loadZoteroItemDetail } from '../../renderer/services/zoteroItemDetailCache'
import type { ZoteroCollectionItem } from '../../shared/types'

vi.mock('../../renderer/services/zoteroInventoryCache', () => ({ loadZoteroInventory: vi.fn() }))
vi.mock('../../renderer/services/zoteroItemDetailCache', () => ({ loadZoteroItemDetail: vi.fn() }))

const entries = [
  {
    key: 'paper',
    title: 'Project title',
    author: '',
    year: '',
    type: 'article',
    doi: 'https://doi.org/10.1234/TEST'
  }
]
const item: ZoteroCollectionItem = {
  itemKey: 'ABCD2345',
  citekey: 'renamedKey',
  title: 'Zotero title',
  author: 'Kim',
  year: '2026',
  type: 'journalArticle',
  doi: '10.1234/test',
  arxivId: null
}
const detail = {
  itemKey: item.itemKey,
  abstract: 'The abstract.',
  publication: 'Journal',
  url: null
}

describe('Zotero citation preview', () => {
  beforeEach(() => {
    useProjectStore.setState({ projectRoot: '/project' })
    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, zoteroEnabled: true, zoteroPort: 23119 }
    }))
    vi.mocked(loadZoteroInventory).mockReset().mockResolvedValue([item])
    vi.mocked(loadZoteroItemDetail).mockReset().mockResolvedValue(detail)
  })
  afterEach(cleanup)

  it('matches normalized DOI even when the citekey differs and loads the abstract', async () => {
    const { result } = renderHook(() => useZoteroCitationPreview(entries, true))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.matches?.get('paper')).toEqual({ item, detail })
    expect(loadZoteroItemDetail).toHaveBeenCalledWith(23119, item.itemKey)
  })

  it('does not contact Zotero for hover previews or when integration is disabled', () => {
    const hook = renderHook(({ active }) => useZoteroCitationPreview(entries, active), {
      initialProps: { active: false }
    })
    expect(loadZoteroInventory).not.toHaveBeenCalled()
    act(() =>
      useSettingsStore.setState((state) => ({
        settings: { ...state.settings, zoteroEnabled: false }
      }))
    )
    hook.rerender({ active: true })
    expect(loadZoteroInventory).not.toHaveBeenCalled()
  })

  it.each([
    ['ambiguous duplicates', [item, { ...item, itemKey: 'EFGH6789' }]],
    ['a title-only match', [{ ...item, doi: null, title: entries[0].title }]]
  ])('does not attach %s', async (_name, inventory) => {
    vi.mocked(loadZoteroInventory).mockResolvedValue(inventory as ZoteroCollectionItem[])
    const { result } = renderHook(() => useZoteroCitationPreview(entries, true))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.matches?.size).toBe(0)
    expect(loadZoteroItemDetail).not.toHaveBeenCalled()
  })

  it('discards a late abstract after another citation opens', async () => {
    let resolve!: (value: typeof detail) => void
    vi.mocked(loadZoteroItemDetail).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    const hook = renderHook(({ bibliography }) => useZoteroCitationPreview(bibliography, true), {
      initialProps: { bibliography: entries }
    })
    await waitFor(() => expect(loadZoteroItemDetail).toHaveBeenCalledOnce())
    hook.rerender({ bibliography: [{ ...entries[0], key: 'other', doi: '' }] })
    await act(async () => {
      resolve(detail)
    })
    expect(hook.result.current.matches?.has('paper')).not.toBe(true)
  })

  it('leaves local metadata available when Zotero is offline', async () => {
    vi.mocked(loadZoteroInventory).mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useZoteroCitationPreview(entries, true))
    await waitFor(() => expect(result.current.unavailable).toBe(true))
    expect(result.current.loading).toBe(false)
    expect(result.current.matches?.size).toBe(0)
  })

  it.each(['project', 'port', 'citation', 'close'] as const)(
    'rejects a pending result after changing %s',
    async (change) => {
      let resolve!: (items: ZoteroCollectionItem[]) => void
      vi.mocked(loadZoteroInventory).mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done
          })
      )
      const hook = renderHook(
        ({ active, bibliography }) => useZoteroCitationPreview(bibliography, active),
        { initialProps: { active: true, bibliography: entries } }
      )
      vi.mocked(loadZoteroInventory).mockResolvedValue([])
      if (change === 'project') act(() => useProjectStore.setState({ projectRoot: '/other' }))
      if (change === 'port')
        act(() =>
          useSettingsStore.setState((state) => ({
            settings: { ...state.settings, zoteroPort: 23120 }
          }))
        )
      if (change === 'citation')
        hook.rerender({ active: true, bibliography: [{ ...entries[0], key: 'other', doi: '' }] })
      if (change === 'close') hook.rerender({ active: false, bibliography: entries })
      await act(async () => {
        resolve([item])
      })
      expect(hook.result.current.matches?.has('paper')).not.toBe(true)
      expect(loadZoteroItemDetail).not.toHaveBeenCalled()
    }
  )
})

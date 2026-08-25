import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadAllZoteroCollectionItems } from '../../renderer/services/zoteroReferenceInventory'
import type { ZoteroCollectionItem } from '../../shared/types'

function item(itemKey: string): ZoteroCollectionItem {
  return {
    itemKey,
    citekey: itemKey.toLocaleLowerCase('en-US'),
    title: itemKey,
    author: '',
    year: '',
    type: 'journalArticle',
    doi: null,
    arxivId: null
  }
}

describe('Zotero reference inventory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('collects paged items and ignores duplicate item keys', async () => {
    vi.mocked(window.api.zoteroCollectionItems)
      .mockResolvedValueOnce({
        items: [item('A'), item('B')],
        totalResults: 3,
        offset: 0,
        limit: 100
      })
      .mockResolvedValueOnce({
        items: [item('B'), item('C')],
        totalResults: 3,
        offset: 2,
        limit: 100
      })

    await expect(loadAllZoteroCollectionItems('/0/PAPERS', 23_119)).resolves.toEqual([
      item('A'),
      item('B'),
      item('C')
    ])
    expect(window.api.zoteroCollectionItems).toHaveBeenNthCalledWith(2, '/0/PAPERS', 2, 100, 23_119)
  })

  it('rejects inventories beyond the bounded cross-check limit', async () => {
    vi.mocked(window.api.zoteroCollectionItems).mockResolvedValueOnce({
      items: [],
      totalResults: 10_001,
      offset: 0,
      limit: 100
    })

    await expect(loadAllZoteroCollectionItems('/0/HUGE', 23_119)).rejects.toThrow('10,000')
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getCachedZoteroItemDetail,
  invalidateZoteroItemDetails,
  loadZoteroItemDetail
} from '../../renderer/services/zoteroItemDetailCache'

const detail = {
  itemKey: 'ABCD2345',
  abstract: 'Current abstract',
  publication: 'ICRA',
  url: null
}

describe('zoteroItemDetailCache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-04T00:00:00Z'))
    invalidateZoteroItemDetails()
    window.api.zoteroItemDetail = vi.fn().mockResolvedValue(detail)
  })

  afterEach(() => vi.useRealTimers())

  it('expires cached metadata so external Zotero edits eventually appear', async () => {
    await loadZoteroItemDetail(23_119, detail.itemKey)
    expect(getCachedZoteroItemDetail(23_119, detail.itemKey)).toEqual(detail)

    vi.advanceTimersByTime(5 * 60 * 1000)

    expect(getCachedZoteroItemDetail(23_119, detail.itemKey)).toBeNull()
    await loadZoteroItemDetail(23_119, detail.itemKey)
    expect(window.api.zoteroItemDetail).toHaveBeenCalledTimes(2)
  })
})

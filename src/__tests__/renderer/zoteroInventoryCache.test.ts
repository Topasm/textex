import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cacheZoteroInventory,
  getCachedZoteroInventory,
  invalidateZoteroInventory
} from '../../renderer/services/zoteroInventoryCache'

const item = {
  itemKey: 'ITEM1',
  citekey: 'paper2025',
  title: 'Paper',
  author: 'Author',
  year: '2025',
  type: 'article',
  doi: null,
  arxivId: null
}

describe('Zotero inventory cache', () => {
  afterEach(() => {
    invalidateZoteroInventory()
    vi.useRealTimers()
  })

  it('reuses recent library inventory and invalidates by port', () => {
    cacheZoteroInventory(23119, '/0', [item])
    expect(getCachedZoteroInventory(23119, '/0')).toEqual([item])
    invalidateZoteroInventory(23119)
    expect(getCachedZoteroInventory(23119, '/0')).toBeNull()
  })

  it('expires inventory after one minute', () => {
    vi.useFakeTimers()
    cacheZoteroInventory(23119, '/0', [item])
    vi.advanceTimersByTime(60_001)
    expect(getCachedZoteroInventory(23119, '/0')).toBeNull()
  })
})

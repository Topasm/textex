import { describe, expect, it } from 'vitest'
import type { ZoteroCollection } from '../../shared/types'
import {
  expandedZoteroAncestors,
  filterExpandedZoteroCollections,
  orderZoteroCollections
} from '../../renderer/services/zoteroCollectionTree'

function collection(key: string, name: string, parentKey: string | null = null): ZoteroCollection {
  return { key, name, parentKey, itemCount: null }
}

describe('Zotero collection tree', () => {
  it('sorts siblings and exposes only expanded descendants', () => {
    const rows = orderZoteroCollections([
      collection('b', 'Beta'),
      collection('child', 'Child', 'a'),
      collection('a', 'Alpha')
    ])

    expect(rows.map(({ collection: item, depth }) => [item.key, depth])).toEqual([
      ['a', 0],
      ['child', 1],
      ['b', 0]
    ])
    expect(
      filterExpandedZoteroCollections(rows, new Set()).map((row) => row.collection.key)
    ).toEqual(['a', 'b'])
    expect(
      filterExpandedZoteroCollections(rows, new Set(['a'])).map((row) => row.collection.key)
    ).toEqual(['a', 'child', 'b'])
  })

  it('expands the selected collection ancestors', () => {
    const rows = orderZoteroCollections([
      collection('root', 'Root'),
      collection('parent', 'Parent', 'root'),
      collection('selected', 'Selected', 'parent')
    ])

    expect(expandedZoteroAncestors(rows, 'selected')).toEqual(new Set(['parent', 'root']))
  })

  it('keeps malformed cycles finite and visible', () => {
    const rows = orderZoteroCollections([
      collection('a', 'Cycle A', 'b'),
      collection('b', 'Cycle B', 'a')
    ])

    expect(rows.map((row) => row.collection.key)).toEqual(['a', 'b'])
    expect(new Set(rows.map((row) => row.collection.key)).size).toBe(2)
  })
})

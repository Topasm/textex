import type { ZoteroCollection } from '../../shared/types'

export interface ZoteroCollectionRow {
  collection: ZoteroCollection
  depth: number
  parentKey: string | null
  hasChildren: boolean
}

export function orderZoteroCollections(collections: ZoteroCollection[]): ZoteroCollectionRow[] {
  const children = new Map<string | null, ZoteroCollection[]>()
  const known = new Set(collections.map((collection) => collection.key))
  for (const collection of collections) {
    const parent =
      collection.parentKey && known.has(collection.parentKey) ? collection.parentKey : null
    const siblings = children.get(parent) ?? []
    siblings.push(collection)
    children.set(parent, siblings)
  }
  for (const siblings of children.values()) {
    siblings.sort((left, right) => left.name.localeCompare(right.name))
  }

  const rows: ZoteroCollectionRow[] = []
  const visited = new Set<string>()
  const append = (roots: ZoteroCollection[], depth: number, parentKey: string | null): void => {
    const stack = roots
      .slice()
      .reverse()
      .map((collection) => ({ collection, depth, parentKey }))
    while (stack.length > 0) {
      const next = stack.pop()
      if (!next || visited.has(next.collection.key)) continue
      visited.add(next.collection.key)
      rows.push({ ...next, hasChildren: false })
      const descendants = children.get(next.collection.key) ?? []
      for (let index = descendants.length - 1; index >= 0; index -= 1) {
        stack.push({
          collection: descendants[index],
          depth: next.depth + 1,
          parentKey: next.collection.key
        })
      }
    }
  }

  append(children.get(null) ?? [], 0, null)
  // Malformed parent cycles should not hide the rest of the library or recurse forever.
  for (const collection of collections) {
    if (visited.has(collection.key)) continue
    append([collection], 0, null)
  }

  const renderedParents = new Set(rows.flatMap((row) => (row.parentKey ? [row.parentKey] : [])))
  for (const row of rows) row.hasChildren = renderedParents.has(row.collection.key)
  return rows
}

export function filterExpandedZoteroCollections(
  rows: ZoteroCollectionRow[],
  expanded: Set<string>
): ZoteroCollectionRow[] {
  const hiddenDepths: number[] = []
  return rows.filter((row) => {
    while (hiddenDepths.length > 0 && row.depth <= hiddenDepths[hiddenDepths.length - 1]) {
      hiddenDepths.pop()
    }
    const hidden = hiddenDepths.length > 0
    if (!expanded.has(row.collection.key)) hiddenDepths.push(row.depth)
    return !hidden
  })
}

export function expandedZoteroAncestors(
  rows: ZoteroCollectionRow[],
  selectedKey: string | null
): Set<string> {
  if (!selectedKey) return new Set()
  const byKey = new Map(rows.map((row) => [row.collection.key, row]))
  const expanded = new Set<string>()
  const visited = new Set<string>()
  let parent = byKey.get(selectedKey)?.parentKey ?? null
  while (parent && !visited.has(parent)) {
    visited.add(parent)
    expanded.add(parent)
    parent = byKey.get(parent)?.parentKey ?? null
  }
  return expanded
}

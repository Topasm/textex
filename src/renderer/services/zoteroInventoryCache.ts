import type { ZoteroCollectionItem } from '../../shared/types'

const INVENTORY_CACHE_TTL_MS = 60_000
const MAX_CACHED_LIBRARIES = 8

type CachedInventory = {
  items: ZoteroCollectionItem[]
  createdAt: number
}

const inventories = new Map<string, CachedInventory>()

function cacheKey(port: number, libraryKey: string): string {
  return `${port}\0${libraryKey}`
}

export function getCachedZoteroInventory(
  port: number,
  libraryKey: string
): ZoteroCollectionItem[] | null {
  const key = cacheKey(port, libraryKey)
  const cached = inventories.get(key)
  if (!cached) return null
  if (Date.now() - cached.createdAt > INVENTORY_CACHE_TTL_MS) {
    inventories.delete(key)
    return null
  }
  inventories.delete(key)
  inventories.set(key, cached)
  return cached.items
}

export function cacheZoteroInventory(
  port: number,
  libraryKey: string,
  items: ZoteroCollectionItem[]
): void {
  const key = cacheKey(port, libraryKey)
  inventories.delete(key)
  inventories.set(key, { items, createdAt: Date.now() })
  while (inventories.size > MAX_CACHED_LIBRARIES) {
    const oldest = inventories.keys().next().value
    if (oldest === undefined) break
    inventories.delete(oldest)
  }
}

export function invalidateZoteroInventory(port?: number): void {
  if (port === undefined) {
    inventories.clear()
    return
  }
  const prefix = `${port}\0`
  for (const key of inventories.keys()) {
    if (key.startsWith(prefix)) inventories.delete(key)
  }
}

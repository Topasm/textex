import type { ZoteroItemDetail } from '../../shared/types'

/**
 * Item detail is fetched one row at a time, so the same row being opened,
 * closed and reopened must not re-hit Zotero. In-flight requests are shared as
 * well: expanding a row twice quickly is one round trip, not two.
 */

const MAX_CACHED_DETAILS = 64
const DETAIL_TTL_MS = 5 * 60 * 1000

const details = new Map<string, { detail: ZoteroItemDetail; expiresAt: number }>()
const inFlight = new Map<string, Promise<ZoteroItemDetail>>()

function cacheKey(port: number, itemKey: string): string {
  return `${port}\0${itemKey}`
}

function remember(key: string, detail: ZoteroItemDetail): void {
  details.delete(key)
  details.set(key, { detail, expiresAt: Date.now() + DETAIL_TTL_MS })
  while (details.size > MAX_CACHED_DETAILS) {
    const oldest = details.keys().next().value
    if (oldest === undefined) break
    details.delete(oldest)
  }
}

export function getCachedZoteroItemDetail(port: number, itemKey: string): ZoteroItemDetail | null {
  const key = cacheKey(port, itemKey)
  const cached = details.get(key)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    details.delete(key)
    return null
  }
  return cached.detail
}

export function loadZoteroItemDetail(port: number, itemKey: string): Promise<ZoteroItemDetail> {
  const key = cacheKey(port, itemKey)
  const cached = getCachedZoteroItemDetail(port, itemKey)
  if (cached) return Promise.resolve(cached)
  const pending = inFlight.get(key)
  if (pending) return pending

  const request = window.api
    .zoteroItemDetail(itemKey, port)
    .then((detail) => {
      remember(key, detail)
      return detail
    })
    .finally(() => {
      inFlight.delete(key)
    })
  inFlight.set(key, request)
  return request
}

export function invalidateZoteroItemDetails(): void {
  details.clear()
  inFlight.clear()
}

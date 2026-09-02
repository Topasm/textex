/**
 * Polls one Zotero collection for size changes while the reference panel is
 * open. Zotero exposes no change feed, so the cheapest reliable signal is the
 * `totalResults` header of a zero-length item page: it costs one request and
 * reports every addition or removal without transferring the collection.
 */

export const ZOTERO_WATCH_INTERVAL_MS = 15_000

export interface ZoteroCollectionChange {
  totalResults: number
  previousTotalResults: number
}

export interface ZoteroCollectionWatchOptions {
  collectionKey: string
  port: number
  /** Baseline the caller already observed, so the first poll can report a change. */
  initialTotalResults?: number | null
  intervalMs?: number
  onChange: (change: ZoteroCollectionChange) => void | Promise<void>
  onError?: (error: unknown) => void
}

/**
 * Starts polling and returns the stop function. The loop is self-scheduling so
 * a slow or hung Zotero request can never queue overlapping polls, and a stop
 * during an in-flight request discards its result.
 */
export function watchZoteroCollection(options: ZoteroCollectionWatchOptions): () => void {
  const intervalMs = options.intervalMs ?? ZOTERO_WATCH_INTERVAL_MS
  let observedTotal = options.initialTotalResults ?? null
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const schedule = (): void => {
    if (stopped) return
    timer = setTimeout(() => void poll(), intervalMs)
  }

  const poll = async (): Promise<void> => {
    try {
      const page = await window.api.zoteroCollectionItems(options.collectionKey, 0, 0, options.port)
      if (stopped) return
      const previousTotalResults = observedTotal
      observedTotal = page.totalResults
      if (previousTotalResults !== null && previousTotalResults !== page.totalResults) {
        await options.onChange({ totalResults: page.totalResults, previousTotalResults })
      }
    } catch (error) {
      if (!stopped) options.onError?.(error)
    }
    schedule()
  }

  schedule()
  return () => {
    stopped = true
    clearTimeout(timer)
  }
}

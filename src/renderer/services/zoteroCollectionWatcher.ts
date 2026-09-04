/**
 * Polls one Zotero collection for library changes. Zotero exposes its library
 * revision in `Last-Modified-Version`; `totalResults` remains a compatibility
 * fallback for local API versions that omit that header.
 */

export const ZOTERO_WATCH_INTERVAL_MS = 15_000

export interface ZoteroCollectionChange {
  totalResults: number
  previousTotalResults: number
  libraryVersion: number | null
  previousLibraryVersion: number | null
}

export interface ZoteroCollectionWatchOptions {
  collectionKey: string
  port: number
  /** Baseline the caller already observed, so the first poll can report a change. */
  initialTotalResults?: number | null
  initialLibraryVersion?: number | null
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
  let observed: { totalResults: number; libraryVersion: number | null } | null =
    options.initialTotalResults == null
      ? null
      : {
          totalResults: options.initialTotalResults,
          libraryVersion: options.initialLibraryVersion ?? null
        }
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
      const current = {
        totalResults: page.totalResults,
        libraryVersion: page.libraryVersion ?? null
      }
      const previous = observed
      const changed =
        previous !== null &&
        (previous.libraryVersion !== null && current.libraryVersion !== null
          ? previous.libraryVersion !== current.libraryVersion
          : previous.totalResults !== current.totalResults)
      if (changed && previous) {
        await options.onChange({
          ...current,
          previousTotalResults: previous.totalResults,
          previousLibraryVersion: previous.libraryVersion
        })
      }
      // Commit the observation only after the consumer has handled it. A
      // rejected sync therefore retries the same Zotero revision next poll.
      observed = current
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

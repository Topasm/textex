import fs from 'fs/promises'
import { createReadStream } from 'fs'
import path from 'path'
import { IDisposable } from '../../shared/lifecycle'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FileCacheEntry {
  content: string
  mtime: number
  size: number
}

interface DirectoryCacheEntry {
  entries: Array<{ name: string; path: string; type: 'file' | 'directory' }>
}

export interface CacheStats {
  fileEntries: number
  directoryEntries: number
  totalMemoryBytes: number
  hits: number
  misses: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_FILES = 50
const LARGE_FILE_WARN_BYTES = 5 * 1024 * 1024 // 5 MB
const LARGE_FILE_REFUSE_BYTES = 50 * 1024 * 1024 // 50 MB

/**
 * Files larger than this threshold are read via streaming instead of
 * a single fs.readFile call, reducing peak memory allocation.
 */
const STREAM_THRESHOLD_BYTES = 2 * 1024 * 1024 // 2 MB

/**
 * When total cached content exceeds this limit we start evicting the
 * oldest entries regardless of the file-count cap. This prevents a
 * small number of large files from consuming too much memory.
 */
const MEMORY_LIMIT_BYTES = 64 * 1024 * 1024 // 64 MB

// ---------------------------------------------------------------------------
// Retry helper for transient FS errors
// ---------------------------------------------------------------------------

const TRANSIENT_CODES = new Set(['EBUSY', 'EACCES', 'EPERM', 'EMFILE', 'ENFILE'])
const MAX_RETRIES = 3
const RETRY_BASE_MS = 50

/**
 * Retry an async operation when the error is a transient filesystem issue.
 */
export async function retryTransient<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (err: unknown) {
      lastError = err
      const code = (err as NodeJS.ErrnoException).code
      if (!code || !TRANSIENT_CODES.has(code)) throw err
      // Exponential back-off: 50ms, 100ms, 200ms …
      await new Promise((r) => setTimeout(r, RETRY_BASE_MS * 2 ** attempt))
    }
  }
  throw lastError
}

// ---------------------------------------------------------------------------
// Streaming file reader
// ---------------------------------------------------------------------------

/**
 * Read a file via a readable stream, collecting chunks into a single Buffer.
 * Uses less peak memory than `fs.readFile` for large files because V8 can
 * allocate incrementally instead of reserving one contiguous block up-front.
 */
export function readFileStreaming(filePath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const stream = createReadStream(filePath)
    stream.on('data', (chunk: Buffer) => chunks.push(chunk))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
}

// ---------------------------------------------------------------------------
// FileContentCache
// ---------------------------------------------------------------------------

/**
 * LRU file content cache with memory-aware eviction.
 *
 * Uses Map insertion-order iteration for O(1) LRU. Entries are evicted
 * when either the file-count cap or the memory-byte cap is exceeded.
 */
class FileContentCache implements IDisposable {
  private cache = new Map<string, FileCacheEntry>()
  private maxSize: number
  private totalBytes = 0
  private _hits = 0
  private _misses = 0

  constructor(maxSize = DEFAULT_MAX_FILES) {
    this.maxSize = maxSize
  }

  /**
   * Get cached content if the file hasn't been modified since caching.
   * Returns null if not cached or stale.
   */
  async get(filePath: string): Promise<FileCacheEntry | null> {
    const entry = this.cache.get(filePath)
    if (!entry) {
      this._misses++
      return null
    }

    try {
      const stat = await retryTransient(() => fs.stat(filePath))
      if (stat.mtimeMs === entry.mtime && stat.size === entry.size) {
        // Move to end for LRU (re-insert)
        this.cache.delete(filePath)
        this.cache.set(filePath, entry)
        this._hits++
        return entry
      }
    } catch {
      // File may have been deleted
      this.removeEntry(filePath)
    }
    this._misses++
    return null
  }

  /**
   * Store a file's content in the cache.
   */
  set(filePath: string, content: string, mtime: number, size: number): void {
    // If already in cache, remove first to refresh insertion order and fix byte count
    this.removeEntry(filePath)

    const entryBytes = Buffer.byteLength(content, 'utf-8')
    this.cache.set(filePath, { content, mtime, size })
    this.totalBytes += entryBytes

    this.evict()
  }

  /**
   * Invalidate a specific file from the cache.
   */
  invalidate(filePath: string): void {
    this.removeEntry(filePath)
  }

  /**
   * Invalidate all files in a directory (used on directory change events).
   */
  invalidateDirectory(dirPath: string): void {
    const normalizedDir = dirPath.endsWith(path.sep) ? dirPath : dirPath + path.sep
    for (const key of this.cache.keys()) {
      if (key.startsWith(normalizedDir)) {
        this.removeEntry(key)
      }
    }
  }

  /**
   * Clear the entire cache.
   */
  clear(): void {
    this.cache.clear()
    this.totalBytes = 0
  }

  /** Snapshot of cache statistics for debugging / diagnostics. */
  getStats(): { entries: number; totalBytes: number; hits: number; misses: number } {
    return {
      entries: this.cache.size,
      totalBytes: this.totalBytes,
      hits: this._hits,
      misses: this._misses
    }
  }

  dispose(): void {
    this.clear()
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private removeEntry(filePath: string): void {
    const existing = this.cache.get(filePath)
    if (existing) {
      this.totalBytes -= Buffer.byteLength(existing.content, 'utf-8')
      this.cache.delete(filePath)
    }
  }

  private evict(): void {
    // Evict while over file-count cap OR memory-byte cap
    while (
      this.cache.size > 0 &&
      (this.cache.size > this.maxSize || this.totalBytes > MEMORY_LIMIT_BYTES)
    ) {
      const oldestKey = this.cache.keys().next().value as string
      this.removeEntry(oldestKey)
    }
  }
}

// ---------------------------------------------------------------------------
// DirectoryListingCache
// ---------------------------------------------------------------------------

/**
 * Directory listing cache with invalidation.
 */
class DirectoryListingCache implements IDisposable {
  private cache = new Map<string, DirectoryCacheEntry>()

  get(dirPath: string): DirectoryCacheEntry | null {
    return this.cache.get(dirPath) ?? null
  }

  set(dirPath: string, entries: DirectoryCacheEntry['entries']): void {
    this.cache.set(dirPath, { entries })
  }

  invalidate(dirPath: string): void {
    this.cache.delete(dirPath)
  }

  /**
   * Invalidate a directory and any parent directory caches that may reference it.
   */
  invalidateForChange(changedPath: string): void {
    const dir = path.dirname(changedPath)
    this.cache.delete(dir)
    this.cache.delete(changedPath)
  }

  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }

  dispose(): void {
    this.clear()
  }
}

// ---------------------------------------------------------------------------
// Singleton instances
// ---------------------------------------------------------------------------

export const fileCache = new FileContentCache()
export const directoryCache = new DirectoryListingCache()

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Check file size and return warning/refusal information.
 */
export async function checkFileSize(filePath: string): Promise<{
  size: number
  warn: boolean
  refuse: boolean
}> {
  const stat = await retryTransient(() => fs.stat(filePath))
  return {
    size: stat.size,
    warn: stat.size > LARGE_FILE_WARN_BYTES,
    refuse: stat.size > LARGE_FILE_REFUSE_BYTES
  }
}

/**
 * Read a file, choosing between streaming and buffered based on size.
 * Wraps transient-error retries.
 */
export async function readFileAuto(filePath: string): Promise<Buffer> {
  const stat = await retryTransient(() => fs.stat(filePath))
  if (stat.size > STREAM_THRESHOLD_BYTES) {
    return retryTransient(() => readFileStreaming(filePath))
  }
  return retryTransient(() => fs.readFile(filePath))
}

/**
 * Aggregate statistics across both caches.
 */
export function getCacheStats(): CacheStats {
  const fc = fileCache.getStats()
  return {
    fileEntries: fc.entries,
    directoryEntries: directoryCache.size,
    totalMemoryBytes: fc.totalBytes,
    hits: fc.hits,
    misses: fc.misses
  }
}

export { STREAM_THRESHOLD_BYTES, LARGE_FILE_WARN_BYTES, LARGE_FILE_REFUSE_BYTES }

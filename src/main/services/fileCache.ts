import fs from 'fs/promises'
import path from 'path'

interface FileCacheEntry {
  content: string
  mtime: number
  size: number
}

interface DirectoryCacheEntry {
  entries: Array<{ name: string; path: string; type: 'file' | 'directory' }>
}

const DEFAULT_MAX_FILES = 50
const LARGE_FILE_WARN_BYTES = 5 * 1024 * 1024 // 5 MB
const LARGE_FILE_REFUSE_BYTES = 50 * 1024 * 1024 // 50 MB

/**
 * LRU file content cache using Map insertion-order iteration.
 */
class FileContentCache {
  private cache = new Map<string, FileCacheEntry>()
  private maxSize: number

  constructor(maxSize = DEFAULT_MAX_FILES) {
    this.maxSize = maxSize
  }

  /**
   * Get cached content if the file hasn't been modified since caching.
   * Returns null if not cached or stale.
   */
  async get(filePath: string): Promise<FileCacheEntry | null> {
    const entry = this.cache.get(filePath)
    if (!entry) return null

    try {
      const stat = await fs.stat(filePath)
      if (stat.mtimeMs === entry.mtime && stat.size === entry.size) {
        // Move to end for LRU (re-insert)
        this.cache.delete(filePath)
        this.cache.set(filePath, entry)
        return entry
      }
    } catch {
      // File may have been deleted
      this.cache.delete(filePath)
    }
    return null
  }

  /**
   * Store a file's content in the cache.
   */
  set(filePath: string, content: string, mtime: number, size: number): void {
    // If already in cache, delete first to refresh insertion order
    this.cache.delete(filePath)
    this.cache.set(filePath, { content, mtime, size })
    this.evict()
  }

  /**
   * Invalidate a specific file from the cache.
   */
  invalidate(filePath: string): void {
    this.cache.delete(filePath)
  }

  /**
   * Invalidate all files in a directory (used on directory change events).
   */
  invalidateDirectory(dirPath: string): void {
    const normalizedDir = dirPath.endsWith(path.sep) ? dirPath : dirPath + path.sep
    for (const key of this.cache.keys()) {
      if (key.startsWith(normalizedDir)) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Clear the entire cache.
   */
  clear(): void {
    this.cache.clear()
  }

  private evict(): void {
    while (this.cache.size > this.maxSize) {
      // Map iterates in insertion order; first key is the oldest (LRU)
      const oldestKey = this.cache.keys().next().value as string
      this.cache.delete(oldestKey)
    }
  }
}

/**
 * Directory listing cache with invalidation.
 */
class DirectoryListingCache {
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
}

// Singleton instances
export const fileCache = new FileContentCache()
export const directoryCache = new DirectoryListingCache()

/**
 * Check file size and return warning/refusal information.
 */
export async function checkFileSize(filePath: string): Promise<{
  size: number
  warn: boolean
  refuse: boolean
}> {
  const stat = await fs.stat(filePath)
  return {
    size: stat.size,
    warn: stat.size > LARGE_FILE_WARN_BYTES,
    refuse: stat.size > LARGE_FILE_REFUSE_BYTES
  }
}

import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { app } from 'electron'

// --- Types ---

interface CacheEntry {
  hash: string
  pdfPath: string
  timestamp: number
  deps: string[]
}

interface PerFileHash {
  mtime: number
  hash: string
}

interface PersistentCacheData {
  version: number
  entries: Record<string, CacheEntry>
}

interface CacheMetrics {
  hits: number
  misses: number
  totalHashTimeMs: number
  hashCount: number
}

// --- Constants ---

const MAX_CACHE_ENTRIES = 100
const CACHE_VERSION = 1
const PERSISTENT_CACHE_FILENAME = 'compile-cache.json'

// --- State ---

const cache = new Map<string, CacheEntry>()
const perFileHashCache = new Map<string, PerFileHash>()
const metrics: CacheMetrics = { hits: 0, misses: 0, totalHashTimeMs: 0, hashCount: 0 }

const INPUT_INCLUDE_RE = /\\(?:input|include)\{([^}]+)\}/g

// --- Persistent cache path ---

function getCachePath(): string {
  return path.join(app.getPath('userData'), PERSISTENT_CACHE_FILENAME)
}

// --- Per-file incremental hashing ---

/**
 * Hash a single file, using mtime to skip re-reading unchanged files.
 */
async function hashFile(filePath: string): Promise<string> {
  const resolved = path.resolve(filePath)
  try {
    const stat = await fs.stat(resolved)
    const mtime = stat.mtimeMs
    const cached = perFileHashCache.get(resolved)
    if (cached && cached.mtime === mtime) {
      return cached.hash
    }
    const content = await fs.readFile(resolved, 'utf-8')
    const hash = crypto.createHash('sha1').update(content).digest('hex')
    perFileHashCache.set(resolved, { mtime, hash })
    return hash
  } catch {
    return ''
  }
}

/**
 * Resolve dependencies from a .tex file content.
 */
function resolveDeps(content: string, dir: string): string[] {
  const deps: string[] = []
  INPUT_INCLUDE_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = INPUT_INCLUDE_RE.exec(content)) !== null) {
    let depPath = match[1]
    if (!depPath.endsWith('.tex')) depPath += '.tex'
    deps.push(path.resolve(dir, depPath))
  }
  return deps
}

/**
 * Gather all dependency file paths recursively.
 */
async function gatherDeps(filePath: string, visited: Set<string>): Promise<string[]> {
  const resolved = path.resolve(filePath)
  if (visited.has(resolved)) return []
  visited.add(resolved)

  let content: string
  try {
    content = await fs.readFile(resolved, 'utf-8')
  } catch {
    return []
  }

  const dir = path.dirname(resolved)
  const directDeps = resolveDeps(content, dir)
  const allDeps = [...directDeps]

  for (const dep of directDeps) {
    const subDeps = await gatherDeps(dep, visited)
    allDeps.push(...subDeps)
  }

  return allDeps
}

/**
 * Compute a content hash for a .tex file and all its dependencies.
 * Uses SHA-1 (faster than MD5) and incremental per-file hashing via mtime.
 */
export async function computeContentHash(filePath: string): Promise<string> {
  const start = performance.now()

  const resolved = path.resolve(filePath)
  const visited = new Set<string>()
  const deps = await gatherDeps(resolved, visited)
  const allFiles = [resolved, ...deps]

  const hashes = await Promise.all(allFiles.map((f) => hashFile(f)))
  const combinedHash = crypto.createHash('sha1').update(hashes.join(':')).digest('hex')

  const elapsed = performance.now() - start
  metrics.totalHashTimeMs += elapsed
  metrics.hashCount++

  return combinedHash
}

/**
 * Check if compilation can be skipped (content unchanged, PDF still exists).
 * Returns the cached PDF path if skip is possible, null otherwise.
 */
export async function checkCompileCache(filePath: string): Promise<string | null> {
  const hash = await computeContentHash(filePath)
  const entry = cache.get(filePath)
  if (!entry || entry.hash !== hash) {
    metrics.misses++
    return null
  }

  // Verify the cached PDF still exists
  try {
    await fs.access(entry.pdfPath)
    metrics.hits++
    return entry.pdfPath
  } catch {
    cache.delete(filePath)
    metrics.misses++
    return null
  }
}

/**
 * Store a successful compilation result in the cache.
 */
export async function updateCompileCache(filePath: string, pdfPath: string): Promise<void> {
  const resolved = path.resolve(filePath)
  const hash = await computeContentHash(filePath)
  const visited = new Set<string>()
  const deps = await gatherDeps(resolved, visited)

  // Evict oldest entries if at capacity
  if (cache.size >= MAX_CACHE_ENTRIES) {
    let oldestKey: string | null = null
    let oldestTime = Infinity
    for (const [key, entry] of cache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp
        oldestKey = key
      }
    }
    if (oldestKey) cache.delete(oldestKey)
  }

  cache.set(filePath, { hash, pdfPath, timestamp: Date.now(), deps })
}

/**
 * Invalidate cache for a specific file.
 */
export function invalidateCompileCache(filePath: string): void {
  cache.delete(filePath)
  // Also invalidate per-file hash so next check re-reads
  const resolved = path.resolve(filePath)
  perFileHashCache.delete(resolved)
}

/**
 * Clear the entire cache.
 */
export function clearCompileCache(): void {
  cache.clear()
  perFileHashCache.clear()
}

// --- Metrics ---

export function getCacheMetrics(): {
  hitRate: number
  avgHashTimeMs: number
  hits: number
  misses: number
  cacheSize: number
} {
  const total = metrics.hits + metrics.misses
  return {
    hitRate: total > 0 ? metrics.hits / total : 0,
    avgHashTimeMs: metrics.hashCount > 0 ? metrics.totalHashTimeMs / metrics.hashCount : 0,
    hits: metrics.hits,
    misses: metrics.misses,
    cacheSize: cache.size
  }
}

// --- Persistent cache (disk) ---

export async function loadPersistentCache(): Promise<void> {
  try {
    const raw = await fs.readFile(getCachePath(), 'utf-8')
    const data: PersistentCacheData = JSON.parse(raw)
    if (data.version !== CACHE_VERSION) return
    for (const [key, entry] of Object.entries(data.entries)) {
      cache.set(key, entry)
    }
  } catch {
    // No persistent cache or corrupt — start fresh
  }
}

export async function savePersistentCache(): Promise<void> {
  const data: PersistentCacheData = {
    version: CACHE_VERSION,
    entries: Object.fromEntries(cache)
  }
  try {
    const cachePath = getCachePath()
    await fs.mkdir(path.dirname(cachePath), { recursive: true })
    await fs.writeFile(cachePath, JSON.stringify(data), 'utf-8')
  } catch {
    // Non-critical: persistence failure shouldn't break anything
  }
}

import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'

interface CacheEntry {
  hash: string
  pdfPath: string
}

const cache = new Map<string, CacheEntry>()

const INPUT_INCLUDE_RE = /\\(?:input|include)\{([^}]+)\}/g

/**
 * Recursively gather content from a .tex file and its \input/\include dependencies.
 * Returns concatenated content suitable for hashing.
 */
async function gatherContent(filePath: string, visited: Set<string>): Promise<string> {
  const resolved = path.resolve(filePath)
  if (visited.has(resolved)) return ''
  visited.add(resolved)

  let content: string
  try {
    content = await fs.readFile(resolved, 'utf-8')
  } catch {
    return ''
  }

  let result = content
  const dir = path.dirname(resolved)
  let match: RegExpExecArray | null
  INPUT_INCLUDE_RE.lastIndex = 0
  while ((match = INPUT_INCLUDE_RE.exec(content)) !== null) {
    let depPath = match[1]
    if (!depPath.endsWith('.tex')) depPath += '.tex'
    const depFull = path.resolve(dir, depPath)
    result += await gatherContent(depFull, visited)
  }

  return result
}

/**
 * Compute a content hash for a .tex file and all its dependencies.
 */
export async function computeContentHash(filePath: string): Promise<string> {
  const visited = new Set<string>()
  const content = await gatherContent(filePath, visited)
  return crypto.createHash('md5').update(content).digest('hex')
}

/**
 * Check if compilation can be skipped (content unchanged, PDF still exists).
 * Returns the cached PDF path if skip is possible, null otherwise.
 */
export async function checkCompileCache(filePath: string): Promise<string | null> {
  const hash = await computeContentHash(filePath)
  const entry = cache.get(filePath)
  if (!entry || entry.hash !== hash) return null

  // Verify the cached PDF still exists
  try {
    await fs.access(entry.pdfPath)
    return entry.pdfPath
  } catch {
    cache.delete(filePath)
    return null
  }
}

/**
 * Store a successful compilation result in the cache.
 */
export async function updateCompileCache(filePath: string, pdfPath: string): Promise<void> {
  const hash = await computeContentHash(filePath)
  cache.set(filePath, { hash, pdfPath })
}

/**
 * Invalidate cache for a specific file.
 */
export function invalidateCompileCache(filePath: string): void {
  cache.delete(filePath)
}

/**
 * Clear the entire cache.
 */
export function clearCompileCache(): void {
  cache.clear()
}

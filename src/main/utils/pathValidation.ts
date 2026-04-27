// Path validation and sanitization logic extracted from ipc/fileSystem.ts.
// Only depends on Node's `path` module — no Electron dependencies.

import path from 'path'

/**
 * Validate that a file path is a non-empty, absolute string.
 * Throws if the path is invalid.
 */
export function validateFilePath(filePath: unknown): string {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('Invalid file path')
  }
  if (!path.isAbsolute(filePath)) {
    throw new Error('File path must be absolute')
  }
  return filePath
}

/**
 * Normalize a user/archive supplied relative path and reject traversal,
 * absolute paths, Windows drive paths, UNC paths, and empty/self references.
 */
export function normalizeSafeRelativePath(relativePath: unknown): string {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    throw new Error('Invalid relative path')
  }
  if (relativePath.includes('\0')) {
    throw new Error('Invalid relative path')
  }

  const posixPath = relativePath.replace(/\\/g, '/')
  if (path.posix.isAbsolute(posixPath) || path.win32.isAbsolute(posixPath)) {
    throw new Error('Relative path must not be absolute')
  }

  const normalized = path.posix.normalize(posixPath)
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    throw new Error('Relative path must stay inside the target directory')
  }

  return normalized
}

/**
 * Resolve a safe relative path inside a base directory. The final resolved path
 * is checked again so callers are protected even if path semantics change.
 */
export function resolveInsideDirectory(basePath: string, relativePath: unknown): string {
  const safeRelativePath = normalizeSafeRelativePath(relativePath)
  const base = path.resolve(basePath)
  const target = path.resolve(base, safeRelativePath)
  const relativeToBase = path.relative(base, target)

  if (relativeToBase === '' || relativeToBase.startsWith('..') || path.isAbsolute(relativeToBase)) {
    throw new Error('Resolved path escapes the target directory')
  }

  return target
}

/**
 * Decode a raw buffer to a string, respecting BOM markers and falling
 * back through UTF-8 -> latin1 when replacement characters appear.
 */
export function readTextFileWithEncoding(buffer: Buffer): string {
  // Check for BOM markers
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf-8')
  }
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le')
  }

  // Try UTF-8 — if decoding produces replacement chars, fall back to latin1
  const utf8 = buffer.toString('utf-8')
  if (utf8.includes('\uFFFD')) {
    return buffer.toString('latin1')
  }
  return utf8
}

/** Directories/patterns to exclude from watcher events. */
export const WATCH_EXCLUDE_DIRS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  '__pycache__',
  '.tectonic'
])

/**
 * Returns true if a changed path should be ignored by the watcher
 * (e.g. inside node_modules or .git).
 */
export function shouldIgnoreChange(filename: string): boolean {
  const parts = filename.split(path.sep)
  return parts.some((p) => WATCH_EXCLUDE_DIRS.has(p))
}

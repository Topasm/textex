import type {
  DirectoryChangeEvent,
  DirectoryEntry,
  ProjectIndexDelta,
  ProjectIndexEntry,
  ProjectIndexSnapshot
} from '../../shared/types'

const DEFAULT_REFRESH_DELAY_MS = 16

export function projectPathKey(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').replace(/\/+$/, '') || '/'
  return /^[a-zA-Z]:\//.test(normalized) || normalized.startsWith('//')
    ? normalized.toLocaleLowerCase('en-US')
    : normalized
}

export function projectRelativePathKey(projectRoot: string, relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  return /^[a-zA-Z]:[\\/]/.test(projectRoot) || projectRoot.startsWith('\\\\')
    ? normalized.toLocaleLowerCase('en-US')
    : normalized
}

export interface ProjectTreeIndex {
  root: string
  childrenByParent: Map<string, ProjectIndexEntry[]>
}

export interface ProjectTreeRow {
  entry: ProjectIndexEntry
  depth: number
}

export function buildProjectTreeIndex(
  root: string,
  entries: ProjectIndexEntry[]
): ProjectTreeIndex {
  const childrenByParent = new Map<string, ProjectIndexEntry[]>()
  for (const entry of entries) {
    const parentKey = projectRelativePathKey(root, entry.parentRelativePath)
    const children = childrenByParent.get(parentKey)
    if (children) children.push(entry)
    else childrenByParent.set(parentKey, [entry])
  }

  for (const children of childrenByParent.values()) {
    children.sort(
      (left, right) =>
        Number(left.type === 'file') - Number(right.type === 'file') ||
        left.name.localeCompare(right.name)
    )
  }
  return { root, childrenByParent }
}

export function flattenVisibleProjectTree(
  index: ProjectTreeIndex,
  expandedRelativePaths: ReadonlySet<string>
): ProjectTreeRow[] {
  const expandedKeys = new Set(
    [...expandedRelativePaths].map((relativePath) =>
      projectRelativePathKey(index.root, relativePath)
    )
  )
  const rows: ProjectTreeRow[] = []
  const pending = (index.childrenByParent.get('') ?? [])
    .map((entry) => ({ entry, depth: 0 }))
    .reverse()
  while (pending.length > 0) {
    const row = pending.pop()!
    rows.push(row)
    if (
      row.entry.type !== 'directory' ||
      !expandedKeys.has(projectRelativePathKey(index.root, row.entry.relativePath))
    ) {
      continue
    }
    const children =
      index.childrenByParent.get(projectRelativePathKey(index.root, row.entry.relativePath)) ?? []
    for (let childIndex = children.length - 1; childIndex >= 0; childIndex -= 1) {
      pending.push({ entry: children[childIndex], depth: row.depth + 1 })
    }
  }
  return rows
}

export interface VirtualRowRange {
  start: number
  end: number
}

const projectIndexEntryLookups = new WeakMap<ProjectIndexSnapshot, Map<string, ProjectIndexEntry>>()

function projectIndexEntryLookup(snapshot: ProjectIndexSnapshot): Map<string, ProjectIndexEntry> {
  const cached = projectIndexEntryLookups.get(snapshot)
  if (cached) return cached
  const lookup = new Map(
    snapshot.entries.map((entry) => [
      projectRelativePathKey(snapshot.root, entry.relativePath),
      entry
    ])
  )
  projectIndexEntryLookups.set(snapshot, lookup)
  return lookup
}

function hasSameTreeIdentity(left: ProjectIndexEntry, right: ProjectIndexEntry): boolean {
  return (
    left.path === right.path &&
    left.relativePath === right.relativePath &&
    left.parentRelativePath === right.parentRelativePath &&
    left.name === right.name &&
    left.type === right.type
  )
}

export function calculateVirtualRowRange(
  rowCount: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  overscan: number
): VirtualRowRange {
  if (rowCount <= 0 || rowHeight <= 0) return { start: 0, end: 0 }
  const safeScrollTop = Math.min(
    Math.max(0, scrollTop),
    Math.max(0, rowCount * rowHeight - rowHeight)
  )
  const safeViewportHeight = Math.max(rowHeight, viewportHeight)
  const start = Math.max(0, Math.floor(safeScrollTop / rowHeight) - overscan)
  const end = Math.min(
    rowCount,
    Math.ceil((safeScrollTop + safeViewportHeight) / rowHeight) + overscan
  )
  return { start, end }
}

/** Applies one ordered watcher delta, returning null when a generation was missed. */
export function applyProjectIndexDelta(
  snapshot: ProjectIndexSnapshot,
  delta: ProjectIndexDelta
): ProjectIndexSnapshot | null {
  if (delta.generation <= snapshot.generation) return snapshot
  if (delta.generation !== snapshot.generation + 1) return null

  const currentEntries = projectIndexEntryLookup(snapshot)
  const changesTree =
    delta.removedPaths.length > 0 ||
    delta.upserted.some((entry) => {
      const current = currentEntries.get(projectRelativePathKey(snapshot.root, entry.relativePath))
      return !current || !hasSameTreeIdentity(current, entry)
    })
  if (!changesTree) {
    const next = { ...snapshot, generation: delta.generation }
    projectIndexEntryLookups.set(next, currentEntries)
    return next
  }

  const entries = new Map(currentEntries)
  for (const relativePath of delta.removedPaths) {
    entries.delete(projectRelativePathKey(snapshot.root, relativePath))
  }
  for (const entry of delta.upserted) {
    entries.set(projectRelativePathKey(snapshot.root, entry.relativePath), entry)
  }

  const next = {
    ...snapshot,
    generation: delta.generation,
    entries: [...entries.values()].sort((left, right) =>
      projectRelativePathKey(snapshot.root, left.relativePath).localeCompare(
        projectRelativePathKey(snapshot.root, right.relativePath)
      )
    )
  }
  projectIndexEntryLookups.set(next, entries)
  return next
}

interface ScoredProjectFile {
  entry: ProjectIndexEntry
  score: number
}

/** Fast path/name search over the native metadata index. File contents are not materialized. */
export function searchProjectFiles(
  entries: ProjectIndexEntry[],
  searchTerm: string,
  limit = 50
): ProjectIndexEntry[] {
  const tokens = searchTerm.trim().toLocaleLowerCase('en-US').split(/\s+/).filter(Boolean)
  if (tokens.length === 0 || limit <= 0) return []

  const matches: ScoredProjectFile[] = []
  for (const entry of entries) {
    if (entry.type !== 'file') continue
    const name = entry.name.toLocaleLowerCase('en-US')
    const relativePath = entry.relativePath.replace(/\\/g, '/').toLocaleLowerCase('en-US')
    if (!tokens.every((token) => relativePath.includes(token))) continue

    const firstToken = tokens[0]
    const score =
      name === firstToken ? 0 : name.startsWith(firstToken) ? 1 : name.includes(firstToken) ? 2 : 3
    matches.push({ entry, score })
  }

  return matches
    .sort(
      (left, right) =>
        left.score - right.score ||
        left.entry.relativePath.length - right.entry.relativePath.length ||
        left.entry.relativePath.localeCompare(right.entry.relativePath)
    )
    .slice(0, limit)
    .map(({ entry }) => entry)
}

/**
 * Resolves the directory whose direct children may have changed.
 * Content-only changes do not affect the project tree and return null.
 */
export function affectedDirectoryPath(
  projectRoot: string,
  change: DirectoryChangeEvent
): string | null {
  if (change.type !== 'rename') return null

  const normalizedRelative = change.filename.replace(/\\/g, '/')
  const segments = normalizedRelative.split('/').filter(Boolean)
  const unsafe =
    normalizedRelative.startsWith('/') ||
    /^[a-zA-Z]:\//.test(normalizedRelative) ||
    segments.length === 0 ||
    segments.some((segment) => segment === '.' || segment === '..')
  if (unsafe) return projectRoot

  const parentSegments = segments.slice(0, -1)
  if (parentSegments.length === 0) return projectRoot

  const separator = projectRoot.includes('\\') ? '\\' : '/'
  const rootWithoutTrailingSeparator = projectRoot.replace(/[\\/]+$/, '')
  return `${rootWithoutTrailingSeparator}${separator}${parentSegments.join(separator)}`
}

interface ProjectIndexOptions {
  projectRoot: string
  readDirectory: (directoryPath: string) => Promise<DirectoryEntry[]>
  publishRoot: (entries: DirectoryEntry[]) => void
  invalidateDirectory: (directoryPath: string) => void
  onError?: (error: unknown) => void
  refreshDelayMs?: number
}

/**
 * Coalesces watcher events by affected parent directory. The root listing is
 * refreshed at most once per batch while nested lazy-directory caches are
 * invalidated without scanning the whole project.
 */
export class ProjectIndexRefreshCoordinator {
  readonly #options: ProjectIndexOptions
  readonly #pendingDirectories = new Map<string, string>()
  #timer: ReturnType<typeof setTimeout> | null = null
  #rootRequestId = 0
  #disposed = false

  constructor(options: ProjectIndexOptions) {
    this.#options = options
  }

  enqueue(change: DirectoryChangeEvent): void {
    if (this.#disposed) return
    const directoryPath = affectedDirectoryPath(this.#options.projectRoot, change)
    if (!directoryPath) return

    this.#pendingDirectories.set(projectPathKey(directoryPath), directoryPath)
    if (this.#timer === null) {
      this.#timer = setTimeout(() => {
        this.#timer = null
        void this.flush()
      }, this.#options.refreshDelayMs ?? DEFAULT_REFRESH_DELAY_MS)
    }
  }

  async flush(): Promise<void> {
    if (this.#disposed || this.#pendingDirectories.size === 0) return

    const pending = [...this.#pendingDirectories.entries()]
    this.#pendingDirectories.clear()
    const rootKey = projectPathKey(this.#options.projectRoot)
    const refreshRoot = pending.some(([key]) => key === rootKey)

    for (const [key, directoryPath] of pending) {
      if (key !== rootKey) this.#options.invalidateDirectory(directoryPath)
    }

    if (!refreshRoot) return

    const requestId = ++this.#rootRequestId
    try {
      const entries = await this.#options.readDirectory(this.#options.projectRoot)
      if (!this.#disposed && requestId === this.#rootRequestId) {
        this.#options.publishRoot(entries)
      }
    } catch (error) {
      if (!this.#disposed && requestId === this.#rootRequestId) this.#options.onError?.(error)
    }
  }

  dispose(): void {
    this.#disposed = true
    this.#rootRequestId += 1
    this.#pendingDirectories.clear()
    if (this.#timer !== null) clearTimeout(this.#timer)
    this.#timer = null
  }
}

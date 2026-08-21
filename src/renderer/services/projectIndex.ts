import type { DirectoryChangeEvent, DirectoryEntry } from '../../shared/types'

const DEFAULT_REFRESH_DELAY_MS = 16

export function projectPathKey(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').replace(/\/+$/, '') || '/'
  return /^[a-zA-Z]:\//.test(normalized) || normalized.startsWith('//')
    ? normalized.toLocaleLowerCase('en-US')
    : normalized
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

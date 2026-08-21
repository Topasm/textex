import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DirectoryEntry, ProjectIndexEntry, ProjectIndexSnapshot } from '../../shared/types'
import {
  affectedDirectoryPath,
  applyProjectIndexDelta,
  buildProjectTreeIndex,
  calculateVirtualRowRange,
  flattenVisibleProjectTree,
  ProjectIndexRefreshCoordinator,
  projectPathKey,
  searchProjectFiles
} from '../../renderer/services/projectIndex'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('projectIndex', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('maps structural events to the affected parent directory', () => {
    expect(
      affectedDirectoryPath('/project', { type: 'rename', filename: 'chapters/intro.tex' })
    ).toBe('/project/chapters')
    expect(affectedDirectoryPath('/project', { type: 'rename', filename: 'main.tex' })).toBe(
      '/project'
    )
    expect(
      affectedDirectoryPath('C:\\Project', {
        type: 'rename',
        filename: 'Chapters\\intro.tex'
      })
    ).toBe('C:\\Project\\Chapters')
    expect(affectedDirectoryPath('/project', { type: 'change', filename: 'main.tex' })).toBeNull()
  })

  it('falls back to the authorized root for malformed watcher paths', () => {
    expect(affectedDirectoryPath('/project', { type: 'rename', filename: '../escape.tex' })).toBe(
      '/project'
    )
    expect(affectedDirectoryPath('/project', { type: 'rename', filename: '/tmp/file.tex' })).toBe(
      '/project'
    )
  })

  it('uses case-insensitive keys for Windows paths', () => {
    expect(projectPathKey('C:\\Project\\Chapters')).toBe(projectPathKey('c:/project/chapters/'))
  })

  it('applies ordered metadata deltas and rejects generation gaps', () => {
    const snapshot: ProjectIndexSnapshot = {
      root: '/project',
      generation: 4,
      entries: [
        {
          path: '/project/main.tex',
          relativePath: 'main.tex',
          parentRelativePath: '',
          name: 'main.tex',
          type: 'file'
        }
      ]
    }

    const next = applyProjectIndexDelta(snapshot, {
      generation: 5,
      removedPaths: ['main.tex'],
      upserted: [
        {
          path: '/project/paper.tex',
          relativePath: 'paper.tex',
          parentRelativePath: '',
          name: 'paper.tex',
          type: 'file'
        }
      ]
    })

    expect(next?.generation).toBe(5)
    expect(next?.entries.map((entry) => entry.relativePath)).toEqual(['paper.tex'])
    expect(
      applyProjectIndexDelta(snapshot, { generation: 6, removedPaths: [], upserted: [] })
    ).toBeNull()
  })

  it('preserves the path array for metadata-only content changes', () => {
    const snapshot: ProjectIndexSnapshot = {
      root: '/project',
      generation: 8,
      entries: [
        {
          path: '/project/main.tex',
          relativePath: 'main.tex',
          parentRelativePath: '',
          name: 'main.tex',
          type: 'file',
          size: 10
        }
      ]
    }
    const next = applyProjectIndexDelta(snapshot, {
      generation: 9,
      removedPaths: [],
      upserted: [{ ...snapshot.entries[0], size: 20 }]
    })

    expect(next?.generation).toBe(9)
    expect(next?.entries).toBe(snapshot.entries)
  })

  it('searches indexed file paths without returning directories', () => {
    const entries: ProjectIndexEntry[] = [
      {
        path: '/project/chapters/introduction.tex',
        relativePath: 'chapters/introduction.tex',
        parentRelativePath: 'chapters',
        name: 'introduction.tex',
        type: 'file'
      },
      {
        path: '/project/appendix/intro-notes.tex',
        relativePath: 'appendix/intro-notes.tex',
        parentRelativePath: 'appendix',
        name: 'intro-notes.tex',
        type: 'file'
      },
      {
        path: '/project/intro',
        relativePath: 'intro',
        parentRelativePath: '',
        name: 'intro',
        type: 'directory'
      }
    ]

    expect(searchProjectFiles(entries, 'intro').map((entry) => entry.relativePath)).toEqual([
      'appendix/intro-notes.tex',
      'chapters/introduction.tex'
    ])
    expect(searchProjectFiles(entries, 'chap intro').map((entry) => entry.relativePath)).toEqual([
      'chapters/introduction.tex'
    ])
  })

  it('flattens only expanded project branches with directories first', () => {
    const entries: ProjectIndexEntry[] = [
      {
        path: '/project/z.tex',
        relativePath: 'z.tex',
        parentRelativePath: '',
        name: 'z.tex',
        type: 'file'
      },
      {
        path: '/project/chapters',
        relativePath: 'chapters',
        parentRelativePath: '',
        name: 'chapters',
        type: 'directory'
      },
      {
        path: '/project/chapters/intro.tex',
        relativePath: 'chapters/intro.tex',
        parentRelativePath: 'chapters',
        name: 'intro.tex',
        type: 'file'
      }
    ]
    const index = buildProjectTreeIndex('/project', entries)

    expect(
      flattenVisibleProjectTree(index, new Set()).map((row) => row.entry.relativePath)
    ).toEqual(['chapters', 'z.tex'])
    expect(
      flattenVisibleProjectTree(index, new Set(['chapters'])).map((row) => [
        row.entry.relativePath,
        row.depth
      ])
    ).toEqual([
      ['chapters', 0],
      ['chapters/intro.tex', 1],
      ['z.tex', 0]
    ])
  })

  it('calculates a bounded viewport range with overscan', () => {
    expect(calculateVirtualRowRange(300, 1_920, 240, 24, 4)).toEqual({
      start: 76,
      end: 94
    })
    expect(calculateVirtualRowRange(3, 0, 0, 24, 4)).toEqual({ start: 0, end: 3 })
  })

  it('coalesces root structural events into one directory read', async () => {
    const entries: DirectoryEntry[] = [
      { name: 'main.tex', path: '/project/main.tex', type: 'file' }
    ]
    const readDirectory = vi.fn().mockResolvedValue(entries)
    const publishRoot = vi.fn()
    const invalidateDirectory = vi.fn()
    const coordinator = new ProjectIndexRefreshCoordinator({
      projectRoot: '/project',
      readDirectory,
      publishRoot,
      invalidateDirectory
    })

    coordinator.enqueue({ type: 'rename', filename: 'main.tex' })
    coordinator.enqueue({ type: 'rename', filename: 'references.bib' })
    coordinator.enqueue({ type: 'change', filename: 'main.tex' })
    await vi.runAllTimersAsync()

    expect(readDirectory).toHaveBeenCalledTimes(1)
    expect(readDirectory).toHaveBeenCalledWith('/project')
    expect(publishRoot).toHaveBeenCalledWith(entries)
    expect(invalidateDirectory).not.toHaveBeenCalled()
    coordinator.dispose()
  })

  it('invalidates each nested directory once without scanning the root', async () => {
    const readDirectory = vi.fn()
    const invalidateDirectory = vi.fn()
    const coordinator = new ProjectIndexRefreshCoordinator({
      projectRoot: '/project',
      readDirectory,
      publishRoot: vi.fn(),
      invalidateDirectory
    })

    coordinator.enqueue({ type: 'rename', filename: 'chapters/one.tex' })
    coordinator.enqueue({ type: 'rename', filename: 'chapters/two.tex' })
    coordinator.enqueue({ type: 'rename', filename: 'appendices/a.tex' })
    await vi.runAllTimersAsync()

    expect(readDirectory).not.toHaveBeenCalled()
    expect(invalidateDirectory).toHaveBeenCalledTimes(2)
    expect(invalidateDirectory).toHaveBeenCalledWith('/project/chapters')
    expect(invalidateDirectory).toHaveBeenCalledWith('/project/appendices')
    coordinator.dispose()
  })

  it('does not publish an older root read after a newer refresh starts', async () => {
    const first = deferred<DirectoryEntry[]>()
    const second = deferred<DirectoryEntry[]>()
    const readDirectory = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const publishRoot = vi.fn()
    const coordinator = new ProjectIndexRefreshCoordinator({
      projectRoot: '/project',
      readDirectory,
      publishRoot,
      invalidateDirectory: vi.fn()
    })

    coordinator.enqueue({ type: 'rename', filename: 'first.tex' })
    const firstFlush = coordinator.flush()
    coordinator.enqueue({ type: 'rename', filename: 'second.tex' })
    const secondFlush = coordinator.flush()

    first.resolve([{ name: 'first.tex', path: '/project/first.tex', type: 'file' }])
    await firstFlush
    expect(publishRoot).not.toHaveBeenCalled()

    const latest = [
      { name: 'second.tex', path: '/project/second.tex', type: 'file' }
    ] satisfies DirectoryEntry[]
    second.resolve(latest)
    await secondFlush
    expect(publishRoot).toHaveBeenCalledOnce()
    expect(publishRoot).toHaveBeenCalledWith(latest)
    coordinator.dispose()
  })
})

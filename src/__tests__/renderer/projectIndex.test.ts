import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DirectoryEntry } from '../../shared/types'
import {
  affectedDirectoryPath,
  ProjectIndexRefreshCoordinator,
  projectPathKey
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

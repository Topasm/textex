import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotesPanel } from '../../renderer/components/research/NotesPanel'
import { useProjectStore } from '../../renderer/store/useProjectStore'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

function directoryEntry(root: string) {
  return [{ name: 'TODO.md', path: `${root}/TODO.md`, type: 'file' as const }]
}

describe('NotesPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useProjectStore.setState({ projectRoot: '/project-a' })
    window.api.readDirectory = vi
      .fn()
      .mockImplementation(async (root: string) => directoryEntry(root))
    window.api.readFile = vi.fn().mockImplementation(async (path: string) => ({
      filePath: path,
      content: '# Notes\nInitial'
    }))
    window.api.saveFile = vi.fn().mockResolvedValue({ success: true })
  })

  it('discards a late read result after switching projects', async () => {
    const projectA = deferred<{ filePath: string; content: string }>()
    window.api.readFile = vi.fn().mockImplementation((path: string) => {
      if (path.startsWith('/project-a/')) return projectA.promise
      return Promise.resolve({ filePath: path, content: '# Project B\nCurrent' })
    })
    render(<NotesPanel />)
    await waitFor(() => expect(window.api.readFile).toHaveBeenCalledWith('/project-a/TODO.md'))

    act(() => useProjectStore.setState({ projectRoot: '/project-b' }))
    expect(await screen.findByText('Project B')).toBeVisible()

    await act(async () => {
      projectA.resolve({ filePath: '/project-a/TODO.md', content: '# Project A\nStale' })
      await projectA.promise
    })

    expect(screen.getByText('Project B')).toBeVisible()
    expect(screen.queryByText('Project A')).not.toBeInTheDocument()
  })

  it('serializes saves and coalesces pending content to the latest value', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const firstSave = deferred<{ success: boolean }>()
      window.api.saveFile = vi
        .fn()
        .mockReturnValueOnce(firstSave.promise)
        .mockResolvedValue({ success: true })
      render(<NotesPanel />)
      await screen.findByText('Initial')

      fireEvent.click(screen.getByText('Initial'))
      const field = screen.getByRole('textbox')
      fireEvent.change(field, { target: { value: 'First edit' } })
      await act(async () => vi.advanceTimersByTimeAsync(500))
      expect(window.api.saveFile).toHaveBeenCalledTimes(1)

      fireEvent.change(field, { target: { value: 'Latest edit' } })
      await act(async () => vi.advanceTimersByTimeAsync(500))
      expect(window.api.saveFile).toHaveBeenCalledTimes(1)

      await act(async () => {
        firstSave.resolve({ success: true })
        await firstSave.promise
      })
      await waitFor(() => expect(window.api.saveFile).toHaveBeenCalledTimes(2))
      expect(window.api.saveFile).toHaveBeenLastCalledWith(
        '# Notes\nLatest edit',
        '/project-a/TODO.md'
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not treat a directory failure as a missing notes file', async () => {
    window.api.readDirectory = vi.fn().mockRejectedValue(new Error('Permission denied'))
    render(<NotesPanel />)

    expect(await screen.findByText('Permission denied')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Create TODO.md' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible()
  })
})

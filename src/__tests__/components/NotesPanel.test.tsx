import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotesPanel } from '../../renderer/components/research/NotesPanel'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import type { ImportedPdfAnnotation } from '../../renderer/services/pdfAnnotations'

const annotations = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock('../../renderer/services/pdfAnnotations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../renderer/services/pdfAnnotations')>()),
  readPdfAnnotations: annotations.read
}))

const review: ImportedPdfAnnotation[] = [
  { page: 2, kind: 'Text', author: 'Reviewer', comment: 'Clarify the result', markedText: '' }
]

function choosePdf() {
  fireEvent.change(screen.getByLabelText('Import PDF annotations', { selector: 'input' }), {
    target: { files: [new File(['pdf'], 'review.pdf', { type: 'application/pdf' })] }
  })
}

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
    annotations.read.mockReset().mockResolvedValue(review)
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

  it('appends review annotations while preserving edits made during the import', async () => {
    const pending = deferred<ImportedPdfAnnotation[]>()
    annotations.read.mockReturnValue(pending.promise)
    render(<NotesPanel />)
    await screen.findByText('Initial')
    choosePdf()
    await waitFor(() => expect(annotations.read).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByText('Initial'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My latest edit' } })
    await act(async () => {
      pending.resolve(review)
    })
    expect(await screen.findByText('Clarify the result')).toBeVisible()
    expect(screen.getByText('My latest edit')).toBeVisible()
    await waitFor(() =>
      expect(window.api.saveFile).toHaveBeenLastCalledWith(
        expect.stringContaining('My latest edit\n\n## PDF annotations: review.pdf'),
        '/project-a/TODO.md'
      )
    )
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('creates notes when importing into a project with no TODO.md', async () => {
    window.api.readDirectory = vi.fn().mockResolvedValue([])
    render(<NotesPanel />)
    await screen.findByRole('button', { name: 'Create TODO.md' })
    choosePdf()
    expect(await screen.findByText('Clarify the result')).toBeVisible()
    await waitFor(() =>
      expect(window.api.saveFile).toHaveBeenCalledWith(
        expect.stringContaining('# Notes\n\n## PDF annotations: review.pdf'),
        '/project-a/TODO.md'
      )
    )
  })

  it('preserves an existing notes filename with different casing', async () => {
    window.api.readDirectory = vi
      .fn()
      .mockResolvedValue([{ name: 'todo.md', path: '/project-a/todo.md', type: 'file' }])
    render(<NotesPanel />)
    await screen.findByText('Initial')
    choosePdf()
    await screen.findByText('Clarify the result')
    await waitFor(() =>
      expect(window.api.saveFile).toHaveBeenCalledWith(expect.any(String), '/project-a/todo.md')
    )
  })

  it('keeps imported notes when an earlier create request completes late', async () => {
    const create = deferred<{ success: boolean }>()
    window.api.readDirectory = vi.fn().mockResolvedValue([])
    window.api.saveFile = vi
      .fn()
      .mockReturnValueOnce(create.promise)
      .mockResolvedValue({ success: true })
    render(<NotesPanel />)
    fireEvent.click(await screen.findByRole('button', { name: 'Create TODO.md' }))
    choosePdf()
    expect(await screen.findByText('Clarify the result')).toBeVisible()
    await act(async () => {
      create.resolve({ success: true })
    })
    expect(screen.getByText('Clarify the result')).toBeVisible()
  })

  it('does not write notes when the PDF has no supported annotations', async () => {
    annotations.read.mockResolvedValue([])
    render(<NotesPanel />)
    await screen.findByText('Initial')
    choosePdf()
    expect(await screen.findByRole('status')).toHaveTextContent('No supported comments')
    expect(window.api.saveFile).not.toHaveBeenCalled()
  })

  it('reports extraction errors without replacing existing notes', async () => {
    annotations.read.mockRejectedValue(new Error('Invalid PDF'))
    render(<NotesPanel />)
    await screen.findByText('Initial')
    choosePdf()
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid PDF')
    expect(screen.getByText('Initial')).toBeVisible()
    expect(window.api.saveFile).not.toHaveBeenCalled()
  })

  it('cancels an in-flight import on project change and ignores its late result', async () => {
    const pending = deferred<ImportedPdfAnnotation[]>()
    annotations.read.mockReturnValue(pending.promise)
    render(<NotesPanel />)
    await screen.findByText('Initial')
    choosePdf()
    await waitFor(() => expect(annotations.read).toHaveBeenCalledOnce())
    const signal = annotations.read.mock.calls[0][1] as AbortSignal
    act(() => useProjectStore.setState({ projectRoot: '/project-b' }))
    await screen.findByText('Initial')
    expect(signal.aborted).toBe(true)
    await act(async () => {
      pending.resolve(review)
    })
    expect(screen.queryByText('Clarify the result')).not.toBeInTheDocument()
    expect(window.api.saveFile).not.toHaveBeenCalled()
  })

  it('lets the user cancel and retry without accepting a late result', async () => {
    const pending = deferred<ImportedPdfAnnotation[]>()
    annotations.read.mockReturnValueOnce(pending.promise)
    render(<NotesPanel />)
    await screen.findByText('Initial')
    choosePdf()
    await waitFor(() => expect(annotations.read).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(annotations.read.mock.calls[0][1].aborted).toBe(true)
    await act(async () => {
      pending.resolve(review)
    })
    expect(screen.queryByText('Clarify the result')).not.toBeInTheDocument()
    choosePdf()
    expect(await screen.findByText('Clarify the result')).toBeVisible()
  })

  it('shows a save error if imported notes cannot be persisted', async () => {
    window.api.saveFile = vi.fn().mockRejectedValue(new Error('Disk full'))
    render(<NotesPanel />)
    await screen.findByText('Initial')
    choosePdf()
    expect(await screen.findByRole('alert')).toHaveTextContent('Disk full')
    expect(screen.getByText('Clarify the result')).toBeVisible()
  })

  it('displays imported Markdown punctuation and LaTeX literally', async () => {
    const comment = 'Use \\alpha_{i} and **literal stars**, [text](https://example.com).'
    annotations.read.mockResolvedValue([{ ...review[0], comment }])
    render(<NotesPanel />)
    await screen.findByText('Initial')
    choosePdf()
    expect(await screen.findByText(comment)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'text' })).not.toBeInTheDocument()
  })
})

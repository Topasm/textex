import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ResearchChatPanel } from '../../renderer/components/research/ResearchChatPanel'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

describe('ResearchChatPanel', () => {
  beforeEach(() => {
    useEditorStore.getState().resetEditor()
    useEditorStore.getState().openFileInTab('/project/paper.tex', '\\section{Method} Draft')
    useProjectStore.setState({ projectRoot: '/project' })
    window.api.researchProfileLoad = vi.fn().mockResolvedValue({
      version: 1,
      paper: {
        title: 'Robot Paper',
        doi: '10.1234/robot',
        authors: [{ id: 'ada', name: 'Ada' }]
      },
      resources: [
        {
          id: 'official-code',
          kind: 'git',
          label: 'Official code',
          url: 'https://github.com/example/robot',
          localPath: 'sources/robot',
          chatAccess: 'indexed-read'
        },
        {
          id: 'project-site',
          kind: 'website',
          label: 'Project site',
          url: 'https://project.example.org',
          chatAccess: 'snapshot'
        }
      ],
      instructions: ['Prefer implementation evidence.']
    })
    window.api.researchSourceIndex = vi.fn().mockResolvedValue({
      resourceId: 'official-code',
      rootPath: '/project/sources/robot',
      branch: 'main',
      indexedAt: 1,
      files: [],
      fileCount: 1,
      totalBytes: 10,
      truncated: false
    })
    window.api.researchSourceSearch = vi.fn().mockResolvedValue([
      {
        resourceId: 'official-code',
        path: 'train.py',
        line: 42,
        startLine: 40,
        snippet: 'def train():',
        score: 110
      }
    ])
    window.api.aiResearchChat = vi.fn().mockResolvedValue('It is implemented in [Official code].')
    window.api.researchResourceSnapshot = vi.fn().mockResolvedValue({
      resourceId: 'project-site',
      url: 'https://project.example.org',
      fetchedAt: 1,
      content: 'Official project documentation',
      truncated: false
    })
  })

  it('sends selected paper, document, author, and repository contexts', async () => {
    render(<ResearchChatPanel onAiDraft={vi.fn()} />)

    const input = await screen.findByPlaceholderText('Ask about this paper or its source code…')
    expect(screen.getByRole('button', { name: 'Official code' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    fireEvent.change(input, { target: { value: 'Where is training implemented?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(window.api.aiResearchChat).toHaveBeenCalledOnce())
    expect(window.api.researchSourceIndex).not.toHaveBeenCalled()
    expect(window.api.researchSourceSearch).not.toHaveBeenCalled()
    expect(window.api.researchResourceSnapshot).not.toHaveBeenCalled()
    expect(window.api.aiResearchChat).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Where is training implemented?',
        instructions: ['Prefer implementation evidence.'],
        contexts: expect.arrayContaining([
          expect.objectContaining({ kind: 'paper', label: 'Robot Paper' }),
          expect.objectContaining({ kind: 'author', label: 'Paper authors' }),
          expect.objectContaining({ kind: 'document', source: '/project/paper.tex' }),
          expect.objectContaining({
            kind: 'repository',
            resourceId: 'official-code',
            content: expect.stringContaining('Local path: sources/robot')
          }),
          expect.objectContaining({
            kind: 'website',
            resourceId: 'project-site',
            source: 'https://project.example.org',
            content: expect.stringContaining('URL: https://project.example.org')
          })
        ])
      })
    )
    expect(await screen.findByText('It is implemented in [Official code].')).toBeInTheDocument()
  })

  it('keeps the conversation and prompt when the active document changes', async () => {
    render(<ResearchChatPanel onAiDraft={vi.fn()} />)
    const input = await screen.findByRole('textbox', { name: 'Research question' })
    fireEvent.change(input, { target: { value: 'First question' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText('It is implemented in [Official code].')).toBeInTheDocument()

    fireEvent.change(input, { target: { value: 'Follow-up draft' } })
    act(() => {
      useEditorStore
        .getState()
        .openFileInTab('/project/appendix.tex', '\\section{Appendix} New context')
    })

    expect(screen.getByText('First question')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Research question' })).toHaveValue(
      'Follow-up draft'
    )
    expect(window.api.researchProfileLoad).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(window.api.aiResearchChat).toHaveBeenCalledTimes(2))
    expect(vi.mocked(window.api.aiResearchChat).mock.calls[1][0].contexts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'document',
          source: '/project/appendix.tex',
          content: expect.stringContaining('New context')
        })
      ])
    )
  })

  it('preserves an explicitly disabled document context across open files', async () => {
    render(<ResearchChatPanel onAiDraft={vi.fn()} />)
    const documentContext = await screen.findByRole('button', { name: 'Current document' })
    fireEvent.click(documentContext)
    expect(documentContext).toHaveAttribute('aria-pressed', 'false')

    act(() => {
      useEditorStore.getState().openFileInTab('/project/appendix.tex', '\\section{Appendix}')
    })

    expect(screen.getByRole('button', { name: 'Current document' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    expect(window.api.researchProfileLoad).toHaveBeenCalledOnce()
  })

  it('does not load chat context without an active project', () => {
    useProjectStore.setState({ projectRoot: null })
    render(<ResearchChatPanel onAiDraft={vi.fn()} />)
    expect(screen.getByText('Open a project to use Research Chat.')).toBeInTheDocument()
    expect(window.api.researchProfileLoad).not.toHaveBeenCalled()
  })

  it('does not append a late AI response to the next project', async () => {
    const pendingAnswer = deferred<string>()
    window.api.aiResearchChat = vi.fn().mockReturnValue(pendingAnswer.promise)
    render(<ResearchChatPanel onAiDraft={vi.fn()} />)
    const input = await screen.findByPlaceholderText('Ask about this paper or its source code…')
    fireEvent.change(input, { target: { value: 'Old project question' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(window.api.aiResearchChat).toHaveBeenCalledOnce())

    act(() => useProjectStore.getState().setProjectRoot('/project-b'))
    await act(async () => {
      pendingAnswer.resolve('Old project answer')
      await pendingAnswer.promise
    })

    expect(screen.queryByText('Old project question')).not.toBeInTheDocument()
    expect(screen.queryByText('Old project answer')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
  })
})

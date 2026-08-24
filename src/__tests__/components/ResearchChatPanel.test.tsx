import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isLikelyZoteroMutation,
  ResearchChatPanel
} from '../../renderer/components/research/ResearchChatPanel'
import { TEXTEX_REFERENCE_MIME } from '../../renderer/components/research/referenceActions'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'

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
    window.api.aiPlanZotero = vi.fn()
    window.api.zoteroApplyMutationPlan = vi.fn()
    window.api.researchResourceSnapshot = vi.fn().mockResolvedValue({
      resourceId: 'project-site',
      url: 'https://project.example.org',
      fetchedAt: 1,
      content: 'Official project documentation',
      truncated: false
    })
    window.api.researchChatSessionLoad = vi.fn().mockImplementation(async () => ({
      projectRoot: useProjectStore.getState().projectRoot ?? '/project',
      projectEpoch: '1',
      revision: '0',
      session: { version: 1, messages: [], selectedContexts: [] }
    }))
    window.api.researchChatSessionSave = vi.fn().mockImplementation(async (scope, session) => ({
      ...scope,
      revision: String(Number(scope.revision) + 1),
      session
    }))
    window.api.researchChatSessionClear = vi.fn().mockImplementation(async (scope) => ({
      ...scope,
      revision: String(Number(scope.revision) + 1),
      session: { version: 1, messages: [], selectedContexts: [] }
    }))
    window.api.findBibInProject = vi.fn().mockResolvedValue([])
  })

  it('offers an accessible empty state and fills a suggested question without sending it', async () => {
    render(<ResearchChatPanel onAiDraft={vi.fn()} />)

    const input = await screen.findByRole('textbox', { name: 'Research question' })
    const messageLog = screen.getByRole('log', { name: 'Research Chat messages' })
    expect(screen.getByRole('heading', { level: 2, name: 'Research Chat' })).toBeInTheDocument()
    expect(messageLog).toHaveAttribute('aria-busy', 'false')
    expect(screen.getByRole('button', { name: 'Clear chat history' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Summarize context' }))

    expect(input).toHaveValue(
      'Summarize the selected research context and highlight the main contribution.'
    )
    expect(input).toHaveFocus()
    expect(window.api.aiResearchChat).not.toHaveBeenCalled()
    expect(window.api.aiPlanZotero).not.toHaveBeenCalled()
  })

  it('exposes response progress on the message log and keeps draft actions locked', async () => {
    const pendingAnswer = deferred<string>()
    window.api.aiResearchChat = vi.fn().mockReturnValue(pendingAnswer.promise)
    render(<ResearchChatPanel onAiDraft={vi.fn()} />)

    const input = await screen.findByRole('textbox', { name: 'Research question' })
    fireEvent.change(input, { target: { value: 'Check this argument.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    const messageLog = screen.getByRole('log', { name: 'Research Chat messages' })
    await waitFor(() => expect(messageLog).toHaveAttribute('aria-busy', 'true'))
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clear chat history' })).toBeDisabled()

    await act(async () => {
      pendingAnswer.resolve('The argument is supported.')
      await pendingAnswer.promise
    })

    expect(await screen.findByText('The argument is supported.')).toBeInTheDocument()
    await waitFor(() => expect(messageLog).toHaveAttribute('aria-busy', 'false'))
  })

  it('sends selected paper, document, author, and repository contexts', async () => {
    render(<ResearchChatPanel onAiDraft={vi.fn()} />)

    const input = await screen.findByRole('textbox', { name: 'Research question' })
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

  it('offers accessible slash commands without sending partial input to the AI', async () => {
    render(<ResearchChatPanel onAiDraft={vi.fn()} />)
    const input = await screen.findByRole('textbox', { name: 'Research question' })

    fireEvent.change(input, { target: { value: '/' } })
    const menu = screen.getByRole('listbox', { name: 'Chat commands' })
    const options = within(menu).getAllByRole('option')
    expect(options).toHaveLength(8)
    expect(input).toHaveAttribute('aria-controls', menu.id)
    expect(input).toHaveAttribute('aria-activedescendant', options[0].id)
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input).toHaveAttribute('aria-activedescendant', options[1].id)
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(input).toHaveValue('/refs ')
    expect(screen.queryByRole('listbox', { name: 'Chat commands' })).not.toBeInTheDocument()
    expect(window.api.aiResearchChat).not.toHaveBeenCalled()
  })

  it('keeps slash command selection IME-safe and lets Escape dismiss only the menu', async () => {
    useProjectStore.setState({ sidebarView: 'files' })
    render(<ResearchChatPanel onAiDraft={vi.fn()} />)
    const input = await screen.findByRole('textbox', { name: 'Research question' })

    fireEvent.change(input, { target: { value: '/todo' } })
    expect(screen.getByRole('listbox', { name: 'Chat commands' })).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true, isComposing: true })
    expect(input).toHaveValue('/todo')
    expect(useProjectStore.getState().sidebarView).not.toBe('todo')

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input).toHaveValue('/todo')
    expect(screen.queryByRole('listbox', { name: 'Chat commands' })).not.toBeInTheDocument()
    expect(window.api.aiResearchChat).not.toHaveBeenCalled()
  })

  it('routes reference, TODO, outline, and draft commands to existing app surfaces', async () => {
    const onAiDraft = vi.fn()
    useProjectStore.setState({
      isSidebarOpen: false,
      sidebarView: 'files',
      researchPanelTab: 'chat',
      researchReferenceSource: 'project',
      researchSearchQuery: ''
    })
    render(<ResearchChatPanel onAiDraft={onAiDraft} />)
    const input = await screen.findByRole('textbox', { name: 'Research question' })
    await screen.findByRole('button', { name: 'Official code' })

    fireEvent.change(input, { target: { value: '/zotero diffusion policy' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(useProjectStore.getState()).toMatchObject({
      researchPanelTab: 'references',
      researchReferenceSource: 'zotero',
      researchSearchQuery: 'diffusion policy'
    })
    expect(window.api.aiResearchChat).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '/todo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(useProjectStore.getState()).toMatchObject({ isSidebarOpen: true, sidebarView: 'todo' })

    fireEvent.change(input, { target: { value: '/outline' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(useProjectStore.getState().sidebarView).toBe('outline')

    fireEvent.change(input, { target: { value: '/draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(onAiDraft).toHaveBeenCalledOnce()
    expect(window.api.aiResearchChat).not.toHaveBeenCalled()
  })

  it('uses an explicit slash command for the reviewable Zotero mutation plan', async () => {
    window.api.aiPlanZotero = vi.fn().mockResolvedValue({
      summary: 'Create a collection.',
      serverId: 'zotero-server',
      port: 23_119,
      projectRoot: '/project',
      projectEpoch: '1',
      operations: [
        {
          kind: 'createCollection',
          key: 'ABCD2345',
          name: 'Writing Projects',
          path: 'Writing Projects',
          parentKey: null,
          parentLabel: 'Library root'
        }
      ]
    })
    render(<ResearchChatPanel onAiDraft={vi.fn()} />)
    const input = await screen.findByRole('textbox', { name: 'Research question' })
    fireEvent.change(input, {
      target: { value: '/zotero-plan Create a Writing Projects collection' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByLabelText('Zotero change preview')).toBeVisible()
    expect(window.api.aiPlanZotero).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Create a Writing Projects collection' }),
      23_119
    )
    expect(window.api.zoteroApplyMutationPlan).not.toHaveBeenCalled()
    expect(window.api.aiResearchChat).not.toHaveBeenCalled()
  })

  it('uses an incoming editor selection as ephemeral Chat context', async () => {
    const consumed = vi.fn()
    render(
      <ResearchChatPanel
        onAiDraft={vi.fn()}
        incomingSelection={{
          token: 7,
          projectRoot: '/project',
          filePath: '/project/paper.tex',
          content: 'A selected claim that needs supporting evidence.',
          startLine: 12,
          endLine: 13
        }}
        onIncomingSelectionConsumed={consumed}
      />
    )

    expect(
      await screen.findByRole('button', { name: 'Selection · paper.tex:L12–13' })
    ).toHaveAttribute('aria-pressed', 'true')
    expect(consumed).toHaveBeenCalledWith(7)

    fireEvent.change(screen.getByRole('textbox', { name: 'Research question' }), {
      target: { value: 'Find evidence for this claim.' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(window.api.aiResearchChat).toHaveBeenCalledOnce())
    expect(vi.mocked(window.api.aiResearchChat).mock.calls[0][0].contexts).toEqual(
      expect.arrayContaining([
        {
          kind: 'document',
          label: 'Selection · paper.tex:L12–13',
          source: '/project/paper.tex#L12–13',
          content: 'A selected claim that needs supporting evidence.'
        }
      ])
    )
    expect(
      vi
        .mocked(window.api.researchChatSessionSave)
        .mock.calls.flatMap(([, session]) => session.selectedContexts)
        .some((context) => context.id.startsWith('selection:'))
    ).toBe(false)
  })

  it('previews and explicitly approves Zotero mutations before writing', async () => {
    const plan = {
      summary: 'Create a writing collection and move ForRSS into it.',
      serverId: 'zotero-server',
      port: 23_119,
      projectRoot: '/project',
      projectEpoch: '1',
      operations: [
        {
          kind: 'createCollection' as const,
          key: 'ABCD2345',
          name: 'Writing Projects',
          path: 'Writing Projects',
          parentKey: null,
          parentLabel: 'Library root'
        },
        {
          kind: 'moveCollection' as const,
          key: 'EFGH6789',
          version: 4,
          name: 'ForRSS',
          path: 'ForRSS',
          parentKey: 'ABCD2345',
          parentLabel: 'Writing Projects'
        }
      ]
    }
    window.api.aiPlanZotero = vi.fn().mockResolvedValue(plan)
    window.api.zoteroApplyMutationPlan = vi.fn().mockResolvedValue({
      summary: 'Applied 2 approved Zotero changes.',
      applied: 2,
      collectionChanges: 2,
      itemChanges: 0
    })
    render(<ResearchChatPanel onAiDraft={vi.fn()} />)

    const input = await screen.findByRole('textbox', { name: 'Research question' })
    fireEvent.change(input, {
      target: { value: 'Writing Projects 컬렉션을 만들고 ForRSS 컬렉션을 그 아래로 옮겨줘' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    const preview = await screen.findByLabelText('Zotero change preview')
    expect(window.api.aiResearchChat).not.toHaveBeenCalled()
    expect(window.api.aiPlanZotero).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Writing Projects 컬렉션을 만들고 ForRSS 컬렉션을 그 아래로 옮겨줘'
      }),
      23_119
    )
    expect(within(preview).getByText('Create “Writing Projects” in Library root')).toBeVisible()
    expect(within(preview).getByText('Move “ForRSS” to Writing Projects')).toBeVisible()
    expect(window.api.zoteroApplyMutationPlan).not.toHaveBeenCalled()

    fireEvent.click(within(preview).getByRole('button', { name: 'Approve in Zotero' }))
    await waitFor(() => expect(window.api.zoteroApplyMutationPlan).toHaveBeenCalledWith(plan))
    expect(await screen.findByText(/Applied 2 approved Zotero changes/u)).toBeInTheDocument()
    expect(screen.queryByLabelText('Zotero change preview')).not.toBeInTheDocument()
  })

  it('cancels a Zotero preview without invoking a write', async () => {
    window.api.aiPlanZotero = vi.fn().mockResolvedValue({
      summary: 'Rename a collection.',
      serverId: 'zotero-server',
      port: 23_119,
      projectRoot: '/project',
      projectEpoch: '1',
      operations: [
        {
          kind: 'renameCollection',
          key: 'ABCD2345',
          version: 2,
          name: 'Drafts',
          path: 'Drafts',
          newName: 'Writing Drafts'
        }
      ]
    })
    render(<ResearchChatPanel onAiDraft={vi.fn()} />)
    fireEvent.change(await screen.findByRole('textbox', { name: 'Research question' }), {
      target: { value: 'Drafts Zotero collection 이름을 Writing Drafts로 변경해줘' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    const preview = await screen.findByLabelText('Zotero change preview')
    fireEvent.click(within(preview).getByRole('button', { name: 'Cancel' }))

    expect(window.api.zoteroApplyMutationPlan).not.toHaveBeenCalled()
    expect(screen.getByText('Cancelled the Zotero changes. Nothing was modified.')).toBeVisible()
  })

  it('previews combined item tags and collection membership changes', async () => {
    window.api.aiPlanZotero = vi.fn().mockResolvedValue({
      summary: 'Classify the matching paper.',
      serverId: 'zotero-server',
      port: 23_119,
      projectRoot: '/project',
      projectEpoch: '1',
      operations: [
        {
          kind: 'updateItem',
          key: 'ABCD2345',
          version: 7,
          title: 'Video Prediction Policy',
          currentTags: [],
          addTags: ['video-based'],
          removeTags: [],
          currentCollections: ['EFGH6789'],
          addCollections: [{ key: 'JKLM2345', path: 'Writing / VLA' }],
          removeCollections: [{ key: 'EFGH6789', path: 'Reading Queue' }]
        }
      ]
    })
    render(<ResearchChatPanel onAiDraft={vi.fn()} />)
    fireEvent.change(await screen.findByRole('textbox', { name: 'Research question' }), {
      target: {
        value:
          'Video Prediction Policy를 Writing / VLA 컬렉션에 추가하고 Reading Queue에서 빼고 video-based 태그를 추가해줘'
      }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    const preview = await screen.findByLabelText('Zotero change preview')
    expect(
      within(preview).getByText(
        'Video Prediction Policy: add video-based; add to Writing / VLA; remove from Reading Queue'
      )
    ).toBeVisible()
    expect(window.api.zoteroApplyMutationPlan).not.toHaveBeenCalled()
  })

  it('discards an unapproved Zotero preview when the active project changes', async () => {
    window.api.aiPlanZotero = vi.fn().mockResolvedValue({
      summary: 'Create a collection.',
      serverId: 'zotero-server',
      port: 23_119,
      projectRoot: '/project',
      projectEpoch: '1',
      operations: [
        {
          kind: 'createCollection',
          key: 'ABCD2345',
          name: 'Writing Projects',
          path: 'Writing Projects',
          parentKey: null,
          parentLabel: 'Library root'
        }
      ]
    })
    render(<ResearchChatPanel onAiDraft={vi.fn()} />)
    fireEvent.change(await screen.findByRole('textbox', { name: 'Research question' }), {
      target: { value: 'Zotero collection을 만들어줘' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByLabelText('Zotero change preview')).toBeVisible()

    act(() => useProjectStore.getState().setProjectRoot('/project-b'))

    await waitFor(() =>
      expect(screen.queryByLabelText('Zotero change preview')).not.toBeInTheDocument()
    )
    expect(window.api.zoteroApplyMutationPlan).not.toHaveBeenCalled()
  })

  it('routes only mutation-shaped Zotero requests to the planner', () => {
    expect(isLikelyZoteroMutation('Zotero 컬렉션을 만들어줘')).toBe(true)
    expect(isLikelyZoteroMutation('이 논문의 Zotero 태그를 추가해줘')).toBe(true)
    expect(isLikelyZoteroMutation('Zotero 컬렉션 목록을 설명해줘')).toBe(false)
    expect(isLikelyZoteroMutation('diffusion policy를 설명해줘')).toBe(false)
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

  it('serializes session writes and advances the native CAS revision', async () => {
    const firstSave = deferred<{
      projectRoot: string
      projectEpoch: string
      revision: string
      session: { version: 1; messages: []; selectedContexts: [] }
    }>()
    window.api.researchChatSessionSave = vi
      .fn()
      .mockReturnValueOnce(firstSave.promise)
      .mockImplementation(async (scope, session) => ({
        ...scope,
        revision: String(Number(scope.revision) + 1),
        session
      }))
    render(<ResearchChatPanel onAiDraft={vi.fn()} />)

    const documentContext = await screen.findByRole('button', { name: 'Current document' })
    await waitFor(() => expect(window.api.researchChatSessionSave).toHaveBeenCalledTimes(1))
    fireEvent.click(documentContext)
    await act(async () => Promise.resolve())
    expect(window.api.researchChatSessionSave).toHaveBeenCalledTimes(1)

    const [firstScope] = vi.mocked(window.api.researchChatSessionSave).mock.calls[0]
    firstSave.resolve({
      ...firstScope,
      revision: '1',
      session: { version: 1, messages: [], selectedContexts: [] }
    })

    await waitFor(() => expect(window.api.researchChatSessionSave).toHaveBeenCalledTimes(2))
    expect(vi.mocked(window.api.researchChatSessionSave).mock.calls[1][0]).toEqual({
      projectRoot: '/project',
      projectEpoch: '1',
      revision: '1'
    })
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
    const input = await screen.findByRole('textbox', { name: 'Research question' })
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

  it('accepts a reference drop, sends only its native descriptor, and renders source actions', async () => {
    const reference = {
      source: 'crossref' as const,
      id: '10.1000/example',
      title: 'Dropped Paper',
      authors: ['Ada Lovelace'],
      year: '2025',
      type: 'article',
      doi: '10.1000/example',
      url: 'https://doi.org/10.1000/example',
      abstract: 'A large abstract that is useful to the live Chat request but not source cards.'
    }
    const compactReference = {
      source: reference.source,
      id: reference.id,
      title: reference.title,
      authors: reference.authors,
      year: reference.year,
      type: reference.type,
      doi: reference.doi,
      url: reference.url
    }
    window.api.researchAddOnline = vi.fn().mockResolvedValue({
      filePath: '/project/references.bib',
      citekey: 'lovelace2025dropped',
      inserted: true,
      duplicate: false
    })
    window.api.zoteroSaveOnline = vi.fn().mockResolvedValue({
      itemKey: 'ABC123',
      citekey: 'lovelace2025dropped',
      duplicate: false
    })
    render(<ResearchChatPanel onAiDraft={vi.fn()} />)

    const composer = await screen.findByLabelText('Research Chat composer')
    fireEvent.drop(composer, {
      dataTransfer: {
        getData: (type: string) =>
          type === TEXTEX_REFERENCE_MIME ? JSON.stringify({ source: 'online', reference }) : ''
      }
    })
    expect(screen.getByRole('button', { name: 'Dropped Paper' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Research question' }), {
      target: { value: 'Compare this paper.' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(window.api.aiResearchChat).toHaveBeenCalledOnce())
    expect(vi.mocked(window.api.aiResearchChat).mock.calls[0][0].contexts).toEqual(
      expect.arrayContaining([
        {
          kind: 'reference',
          label: 'Dropped Paper',
          reference: { source: 'online', onlineReference: reference }
        }
      ])
    )
    const sources = await screen.findByLabelText('Attached references')
    expect(within(sources).getByText('Dropped Paper')).toBeInTheDocument()

    fireEvent.click(within(sources).getByRole('button', { name: 'Save to library' }))
    await waitFor(() =>
      expect(window.api.zoteroSaveOnline).toHaveBeenCalledWith(compactReference, expect.any(Number))
    )
    fireEvent.click(within(sources).getByRole('button', { name: 'Cite' }))
    await waitFor(() => expect(window.api.researchAddOnline).toHaveBeenCalledWith(compactReference))
    expect(useEditorStore.getState().pendingInsertText).toBe('\\cite{lovelace2025dropped}')

    fireEvent.click(screen.getByRole('button', { name: 'Insert answer' }))
    expect(useEditorStore.getState().pendingInsertText).toBe(
      'It is implemented in [Official code].'
    )
    await waitFor(() =>
      expect(window.api.researchChatSessionSave).toHaveBeenCalledWith(
        expect.objectContaining({ projectRoot: '/project' }),
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'assistant',
              sources: [expect.objectContaining({ label: 'Dropped Paper' })]
            })
          ]),
          selectedContexts: expect.arrayContaining([
            expect.objectContaining({
              kind: 'reference',
              referenceSource: 'online',
              onlineReference: compactReference
            })
          ])
        })
      )
    )
  })

  it('consumes an incoming tab-drop reference once after session hydration', async () => {
    const pendingSession = deferred<{
      projectRoot: string
      projectEpoch: string
      revision: string
      session: { version: 1; messages: []; selectedContexts: [] }
    }>()
    window.api.researchChatSessionLoad = vi.fn().mockReturnValue(pendingSession.promise)
    const consumed = vi.fn()
    const incomingReference = {
      token: 41,
      projectRoot: '/project',
      payload: {
        source: 'project' as const,
        citekey: 'hydrated2026',
        metadata: { title: 'Hydrated Reference' }
      }
    }
    const { rerender } = render(
      <ResearchChatPanel
        onAiDraft={vi.fn()}
        incomingReference={incomingReference}
        onIncomingReferenceConsumed={consumed}
      />
    )

    expect(screen.queryByRole('button', { name: 'Hydrated Reference' })).not.toBeInTheDocument()
    await act(async () => {
      pendingSession.resolve({
        projectRoot: '/project',
        projectEpoch: '1',
        revision: '0',
        session: { version: 1, messages: [], selectedContexts: [] }
      })
      await pendingSession.promise
    })

    expect(await screen.findByRole('button', { name: 'Hydrated Reference' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(consumed).toHaveBeenCalledOnce()
    expect(consumed).toHaveBeenCalledWith(41)

    rerender(
      <ResearchChatPanel
        onAiDraft={vi.fn()}
        incomingReference={incomingReference}
        onIncomingReferenceConsumed={consumed}
      />
    )
    expect(consumed).toHaveBeenCalledOnce()
    expect(screen.getAllByRole('button', { name: 'Hydrated Reference' })).toHaveLength(1)
  })

  it('reports an already attached incoming reference without duplicating its chip', async () => {
    const consumed = vi.fn()
    const incomingReference = {
      token: 42,
      projectRoot: '/project',
      payload: {
        source: 'project' as const,
        citekey: 'duplicate2026',
        metadata: { title: 'Duplicate Reference' }
      }
    }
    const { rerender } = render(
      <ResearchChatPanel
        onAiDraft={vi.fn()}
        incomingReference={incomingReference}
        onIncomingReferenceConsumed={consumed}
      />
    )
    expect(await screen.findByRole('button', { name: 'Duplicate Reference' })).toBeInTheDocument()

    rerender(
      <ResearchChatPanel
        onAiDraft={vi.fn()}
        incomingReference={{ ...incomingReference, token: 43 }}
        onIncomingReferenceConsumed={consumed}
      />
    )

    expect(
      await screen.findByText('“Duplicate Reference” is already attached to Chat.')
    ).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Duplicate Reference' })).toHaveLength(1)
    expect(consumed).toHaveBeenCalledTimes(2)
  })

  it('restores a per-project conversation and citation source from native storage', async () => {
    window.api.findBibInProject = vi.fn().mockResolvedValue([
      {
        key: 'stored2025',
        type: 'article',
        title: 'Stored Project Paper',
        author: 'Stored Author',
        year: '2025'
      }
    ])
    window.api.researchChatSessionLoad = vi.fn().mockResolvedValue({
      projectRoot: '/project',
      projectEpoch: '1',
      revision: '7',
      session: {
        version: 1,
        messages: [
          { role: 'user', content: 'Stored question' },
          {
            role: 'assistant',
            content: 'Stored answer',
            sources: [
              {
                id: 'reference:project:citekey:stored2025',
                kind: 'reference',
                label: 'Stored Project Paper',
                source: 'Stored Author · 2025',
                citekey: 'stored2025',
                referenceSource: 'project'
              }
            ]
          }
        ],
        selectedContexts: [
          {
            id: 'reference:project:citekey:stored2025',
            kind: 'reference',
            label: 'Stored Project Paper',
            source: 'Stored Author · 2025',
            citekey: 'stored2025',
            referenceSource: 'project'
          },
          {
            id: 'reference:zotero:citekey:zotero2024',
            kind: 'reference',
            label: 'Stored Zotero Paper',
            source: 'Zotero Author · 2024',
            citekey: 'zotero2024',
            referenceSource: 'zotero'
          }
        ]
      }
    })

    render(<ResearchChatPanel onAiDraft={vi.fn()} />)

    expect(await screen.findByText('Stored question')).toBeInTheDocument()
    expect(screen.getByText('Stored answer')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stored Project Paper' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    const sources = screen.getByLabelText('Attached references')
    fireEvent.click(within(sources).getByRole('button', { name: 'Cite' }))
    await waitFor(() =>
      expect(useEditorStore.getState().pendingInsertText).toBe('\\cite{stored2025}')
    )
    await waitFor(() => expect(window.api.researchChatSessionSave).toHaveBeenCalled())
    const savedSession = vi.mocked(window.api.researchChatSessionSave).mock.calls.at(-1)![1]
    expect(savedSession.selectedContexts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          citekey: 'stored2025',
          source: 'Stored Author · 2025'
        }),
        expect.objectContaining({
          citekey: 'zotero2024',
          source: 'Zotero Author · 2024'
        })
      ])
    )
  })

  it('rejects a thirteenth attached reference without reporting or selecting phantom success', async () => {
    render(<ResearchChatPanel onAiDraft={vi.fn()} />)
    const composer = await screen.findByLabelText('Research Chat composer')

    for (let index = 1; index <= 13; index += 1) {
      fireEvent.drop(composer, {
        dataTransfer: {
          getData: (type: string) =>
            type === TEXTEX_REFERENCE_MIME
              ? JSON.stringify({
                  source: 'project',
                  citekey: `paper${index}`,
                  metadata: { title: `Attached paper ${index}` }
                })
              : ''
        }
      })
    }

    expect(screen.getByText('Chat supports up to 12 attached references.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Attached paper 13' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Attached paper 12' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('uses the current configured Zotero port when citing a Chat source card', async () => {
    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, zoteroPort: 24_680 }
    }))
    window.api.zoteroAddToProject = vi.fn().mockResolvedValue({
      filePath: '/project/zotero.bib',
      citekey: 'robot2025',
      inserted: true,
      duplicate: false
    })
    render(<ResearchChatPanel onAiDraft={vi.fn()} />)
    const composer = await screen.findByLabelText('Research Chat composer')
    fireEvent.drop(composer, {
      dataTransfer: {
        getData: (type: string) =>
          type === TEXTEX_REFERENCE_MIME
            ? JSON.stringify({
                source: 'zotero',
                citekey: 'robot2025',
                port: 12_345,
                metadata: { title: 'Zotero paper' }
              })
            : ''
      }
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Research question' }), {
      target: { value: 'Summarize it.' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    const sources = await screen.findByLabelText('Attached references')
    fireEvent.click(within(sources).getByRole('button', { name: 'Cite' }))
    await waitFor(() =>
      expect(window.api.zoteroAddToProject).toHaveBeenCalledWith('robot2025', 24_680)
    )
  })

  it('does not publish a source action status after the active project changes', async () => {
    const pendingSave = deferred<{ itemKey: string; citekey: string; duplicate: boolean }>()
    window.api.zoteroSaveOnline = vi.fn().mockReturnValue(pendingSave.promise)
    const reference = {
      source: 'crossref' as const,
      id: 'stale-action',
      title: 'Stale action paper',
      authors: [],
      year: '2025',
      type: 'article'
    }
    render(<ResearchChatPanel onAiDraft={vi.fn()} />)
    const composer = await screen.findByLabelText('Research Chat composer')
    fireEvent.drop(composer, {
      dataTransfer: {
        getData: (type: string) =>
          type === TEXTEX_REFERENCE_MIME ? JSON.stringify({ source: 'online', reference }) : ''
      }
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Research question' }), {
      target: { value: 'Summarize it.' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    const sources = await screen.findByLabelText('Attached references')
    fireEvent.click(within(sources).getByRole('button', { name: 'Save to library' }))

    act(() => useProjectStore.getState().setProjectRoot('/project-b'))
    await act(async () => {
      pendingSave.resolve({ itemKey: 'OLD', citekey: 'old2025', duplicate: false })
      await pendingSave.promise
    })

    expect(screen.queryByText('Saved to Zotero.')).not.toBeInTheDocument()
  })

  it('compacts multibyte messages and the persisted session within native byte limits', async () => {
    window.api.aiResearchChat = vi.fn().mockResolvedValue('한'.repeat(30_000))
    render(<ResearchChatPanel onAiDraft={vi.fn()} />)
    const input = await screen.findByRole('textbox', { name: 'Research question' })
    fireEvent.change(input, { target: { value: '😀'.repeat(20_000) } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(window.api.aiResearchChat).toHaveBeenCalledOnce())
    const request = vi.mocked(window.api.aiResearchChat).mock.calls[0][0]
    expect(new TextEncoder().encode(request.message).byteLength).toBeLessThanOrEqual(64 * 1024)
    await waitFor(() => expect(window.api.researchChatSessionSave).toHaveBeenCalled())
    const saveCall = vi.mocked(window.api.researchChatSessionSave).mock.calls.at(-1)!
    const savedSession = saveCall[1]
    const messageBytes = savedSession.messages.map(
      (message) => new TextEncoder().encode(message.content).byteLength
    )
    expect(Math.max(...messageBytes)).toBeLessThanOrEqual(64 * 1024)
    expect(messageBytes.reduce((total, bytes) => total + bytes, 0)).toBeLessThanOrEqual(512 * 1024)
    expect(new TextEncoder().encode(JSON.stringify(savedSession, null, 2)).byteLength).toBeLessThan(
      1024 * 1024
    )
  })
})

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ResearchProfilePanel } from '../../renderer/components/research/ResearchProfilePanel'
import {
  clearResearchProfileDraft,
  hasUnsavedResearchProfileDraft
} from '../../renderer/services/researchProfileDraft'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import type { ResearchProfile } from '../../shared/types'

const emptyProfile: ResearchProfile = {
  version: 1,
  paper: { title: '', authors: [] },
  resources: [],
  instructions: []
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

describe('ResearchProfilePanel', () => {
  beforeEach(() => {
    clearResearchProfileDraft()
    useEditorStore.getState().resetEditor()
    useProjectStore.setState({ projectRoot: '/project' })
    window.api.researchProfileLoad = vi.fn().mockResolvedValue(emptyProfile)
    window.api.researchProfileSave = vi.fn().mockImplementation(async (profile) => profile)
    window.api.researchSourceIndex = vi.fn()
  })

  it('loads, edits, and saves paper metadata, people, resources, and instructions', async () => {
    render(<ResearchProfilePanel />)

    await waitFor(() => expect(window.api.researchProfileLoad).toHaveBeenCalledOnce())
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'A Robot Paper' } })
    fireEvent.change(screen.getByLabelText('DOI'), { target: { value: '10.1000/robot' } })

    fireEvent.click(screen.getByRole('button', { name: 'Add author' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada Researcher' } })
    fireEvent.change(screen.getByLabelText('ORCID'), {
      target: { value: '0000-0001-2345-6789' }
    })

    fireEvent.click(screen.getByRole('button', { name: 'Add resource' }))
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Official code' } })
    const sshUrlInput = screen.getByLabelText('SSH URL')
    fireEvent.change(sshUrlInput, {
      target: { value: 'git@github.com:lab/robot.git' }
    })
    fireEvent.blur(sshUrlInput)
    fireEvent.change(screen.getByLabelText('Chat access'), {
      target: { value: 'indexed-read' }
    })
    fireEvent.change(screen.getByLabelText('Project-specific instructions, one per line'), {
      target: { value: 'Check claims against the paper.\nPrefer source citations.' }
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))

    await waitFor(() => expect(window.api.researchProfileSave).toHaveBeenCalledOnce())
    expect(window.api.researchProfileSave).toHaveBeenCalledWith(
      expect.objectContaining({
        paper: expect.objectContaining({
          title: 'A Robot Paper',
          doi: '10.1000/robot',
          authors: [
            expect.objectContaining({
              id: expect.any(String),
              name: 'Ada Researcher',
              orcid: '0000-0001-2345-6789'
            })
          ]
        }),
        resources: [
          expect.objectContaining({
            id: expect.any(String),
            kind: 'git',
            label: 'Official code',
            sshUrl: 'git@github.com:lab/robot.git',
            url: 'https://github.com/lab/robot',
            chatAccess: 'indexed-read'
          })
        ],
        instructions: ['Check claims against the paper.', 'Prefer source citations.']
      })
    )
    expect(await screen.findByText('Research profile saved.')).toBeInTheDocument()
    expect(hasUnsavedResearchProfileDraft()).toBe(false)
  })

  it('normalizes empty optional fields and instructions without changing abstract paragraphs', async () => {
    const abstract = 'First paragraph.\n\nSecond paragraph keeps its layout.'
    window.api.researchProfileLoad = vi.fn().mockResolvedValue({
      version: 1,
      paper: {
        title: 'Paper',
        abstract,
        doi: '',
        arxiv: '   ',
        venue: '',
        website: '',
        authors: [
          {
            id: 'ada',
            name: 'Ada',
            role: '',
            email: '  ',
            homepage: '',
            github: '',
            orcid: ''
          }
        ]
      },
      resources: [
        {
          id: 'official-code',
          kind: 'git',
          label: 'Official code',
          url: '',
          sshUrl: '  ',
          localPath: '',
          branch: '',
          chatAccess: 'metadata'
        }
      ],
      instructions: ['  Check the paper.  ', '', '   ', 'Keep citations precise.', '']
    })
    render(<ResearchProfilePanel />)
    expect(await screen.findByLabelText('Abstract')).toHaveValue(abstract)

    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))

    await waitFor(() => expect(window.api.researchProfileSave).toHaveBeenCalledOnce())
    const saved = vi.mocked(window.api.researchProfileSave).mock.calls[0][0]
    expect(saved).toEqual({
      version: 1,
      paper: {
        title: 'Paper',
        abstract,
        authors: [{ id: 'ada', name: 'Ada' }]
      },
      resources: [
        {
          id: 'official-code',
          kind: 'git',
          label: 'Official code',
          chatAccess: 'metadata'
        }
      ],
      instructions: ['Check the paper.', 'Keep citations precise.']
    })
  })

  it('does not load profile data until a project is open', () => {
    useProjectStore.setState({ projectRoot: null })

    render(<ResearchProfilePanel />)

    expect(
      screen.getByText('Open a project to configure its research profile.')
    ).toBeInTheDocument()
    expect(window.api.researchProfileLoad).not.toHaveBeenCalled()
  })

  it('surfaces load errors and allows starting with an empty profile', async () => {
    window.api.researchProfileLoad = vi.fn().mockRejectedValue(new Error('Profile is invalid'))

    render(<ResearchProfilePanel />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Profile is invalid')
    fireEvent.click(screen.getByRole('button', { name: 'Create an empty profile' }))
    expect(screen.getByLabelText('Title')).toHaveValue('')
    expect(hasUnsavedResearchProfileDraft()).toBe(true)
  })

  it('keeps newer edits dirty when an earlier save finishes', async () => {
    const pending = deferred<ResearchProfile>()
    window.api.researchProfileSave = vi.fn().mockReturnValue(pending.promise)
    render(<ResearchProfilePanel />)
    const title = await screen.findByLabelText('Title')
    fireEvent.change(title, { target: { value: 'First edit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    fireEvent.change(title, { target: { value: 'Newer edit' } })

    await act(async () => {
      pending.resolve({ ...emptyProfile, paper: { ...emptyProfile.paper, title: 'First edit' } })
      await pending.promise
    })

    expect(screen.getByLabelText('Title')).toHaveValue('Newer edit')
    expect(await screen.findByText('Profile saved. You have newer unsaved changes.')).toBeVisible()
    expect(hasUnsavedResearchProfileDraft()).toBe(true)
  })

  it('serializes repeated form submissions before React can disable the save button', async () => {
    const pending = deferred<ResearchProfile>()
    window.api.researchProfileSave = vi.fn().mockReturnValue(pending.promise)
    const { container } = render(<ResearchProfilePanel />)
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'One save' } })
    const form = container.querySelector('form')
    expect(form).not.toBeNull()

    fireEvent.submit(form!)
    fireEvent.submit(form!)

    expect(window.api.researchProfileSave).toHaveBeenCalledOnce()
    await act(async () => {
      pending.resolve({ ...emptyProfile, paper: { ...emptyProfile.paper, title: 'One save' } })
      await pending.promise
    })
  })

  it('ignores a late profile load from the previous project', async () => {
    const first = deferred<ResearchProfile>()
    const secondProfile: ResearchProfile = {
      ...emptyProfile,
      paper: { ...emptyProfile.paper, title: 'Project B' }
    }
    window.api.researchProfileLoad = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(secondProfile)
    render(<ResearchProfilePanel />)
    await waitFor(() => expect(window.api.researchProfileLoad).toHaveBeenCalledOnce())

    act(() => useProjectStore.getState().setProjectRoot('/project-b'))
    expect(await screen.findByDisplayValue('Project B')).toBeInTheDocument()
    await act(async () => {
      first.resolve({ ...emptyProfile, paper: { ...emptyProfile.paper, title: 'Project A' } })
      await first.promise
    })

    expect(screen.getByLabelText('Title')).toHaveValue('Project B')
  })

  it('keeps profile fields empty when opening, editing, or switching LaTeX documents', async () => {
    const metadata = String.raw`\title{Document title}\author{Ada Lovelace}\doi{10.1234/example}\arxiv{2401.12345}`
    useEditorStore.getState().openFileInTab('/project/paper.tex', metadata)
    render(<ResearchProfilePanel />)
    await screen.findByLabelText('Title')

    const expectEmpty = () => {
      for (const label of ['Title', 'DOI', 'arXiv'])
        expect(screen.getByLabelText(label)).toHaveValue('')
      expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
      expect(hasUnsavedResearchProfileDraft()).toBe(false)
    }
    expectEmpty()
    act(() => useEditorStore.getState().updateActiveDocument(`${metadata}\nEdited`))
    expectEmpty()
    act(() => useEditorStore.getState().openFileInTab('/project/other.tex', metadata))
    expectEmpty()
    expect(
      screen.queryByRole('button', { name: 'Fill empty fields from document' })
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/fields are filled from explicit commands/)).not.toBeInTheDocument()
  })

  it('preserves saved metadata and lets the user clear it without restoring document values', async () => {
    useEditorStore
      .getState()
      .openFileInTab('/project/paper.tex', String.raw`\title{Document title}`)
    window.api.researchProfileLoad = vi.fn().mockResolvedValue({
      ...emptyProfile,
      paper: {
        title: 'Saved title',
        doi: '10.1234/saved',
        arxiv: '2401.12345',
        authors: [{ id: 'ada', name: 'Ada' }]
      }
    })
    render(<ResearchProfilePanel />)
    const title = await screen.findByDisplayValue('Saved title')
    expect(screen.getByLabelText('DOI')).toHaveValue('10.1234/saved')
    expect(screen.getByLabelText('arXiv')).toHaveValue('2401.12345')
    expect(screen.getByLabelText('Name')).toHaveValue('Ada')
    expect(hasUnsavedResearchProfileDraft()).toBe(false)
    fireEvent.change(title, { target: { value: '' } })
    act(() =>
      useEditorStore.getState().updateActiveDocument(String.raw`\title{Changed document title}`)
    )
    expect(title).toHaveValue('')
    expect(hasUnsavedResearchProfileDraft()).toBe(true)
  })

  it('keeps DOI and arXiv in an optional publication identifiers section', async () => {
    render(<ResearchProfilePanel />)
    await screen.findByLabelText('Title')

    const identifiers = screen.getByText('Publication identifiers (optional)').closest('details')
    expect(identifiers).not.toHaveAttribute('open')
    expect(
      screen.getByText(/only when the paper has a published DOI or arXiv identifier/i)
    ).toBeInTheDocument()
  })

  it('indexes an opted-in local Git source and displays its limits', async () => {
    window.api.researchProfileLoad = vi.fn().mockResolvedValue({
      ...emptyProfile,
      resources: [
        {
          id: 'official-code',
          kind: 'git',
          label: 'Official code',
          localPath: 'sources/official',
          chatAccess: 'indexed-read'
        }
      ]
    })
    window.api.researchSourceIndex = vi.fn().mockResolvedValue({
      resourceId: 'official-code',
      rootPath: '/project/sources/official',
      branch: 'main',
      indexedAt: 1,
      files: [
        { path: 'src/a.ts', bytes: 1024, language: 'typescript' },
        { path: 'src/b.ts', bytes: 1024, language: 'typescript' }
      ],
      fileCount: 2,
      totalBytes: 2048,
      truncated: true
    })

    render(<ResearchProfilePanel />)
    fireEvent.click(await screen.findByRole('button', { name: 'Index source' }))

    await waitFor(() =>
      expect(window.api.researchSourceIndex).toHaveBeenCalledWith(
        'official-code',
        'sources/official'
      )
    )
    expect(await screen.findByText('2 files')).toBeInTheDocument()
    expect(screen.getByText('2.0 KB')).toBeInTheDocument()
    expect(screen.getByText('Index limit reached')).toBeInTheDocument()
  })

  it('limits Chat access by resource kind and repairs invalid access on kind changes', async () => {
    window.api.researchProfileLoad = vi.fn().mockResolvedValue({
      ...emptyProfile,
      resources: [
        {
          id: 'official-code',
          kind: 'git',
          label: 'Official code',
          localPath: 'sources/official',
          chatAccess: 'indexed-read'
        }
      ]
    })
    render(<ResearchProfilePanel />)
    const kind = await screen.findByLabelText('Kind')
    const access = screen.getByLabelText('Chat access')

    expect(access).toHaveValue('indexed-read')
    expect(screen.getByRole('option', { name: 'Read indexed source' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Read saved snapshot' })).not.toBeInTheDocument()

    fireEvent.change(kind, { target: { value: 'website' } })
    expect(access).toHaveValue('metadata')
    expect(screen.queryByRole('option', { name: 'Read indexed source' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Read saved snapshot' })).toBeInTheDocument()

    fireEvent.change(access, { target: { value: 'snapshot' } })
    fireEvent.change(kind, { target: { value: 'git' } })
    expect(access).toHaveValue('metadata')
    expect(screen.queryByRole('option', { name: 'Read saved snapshot' })).not.toBeInTheDocument()
  })

  it('requires confirmation, saves the profile, and clones by resource id only', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const profile: ResearchProfile = {
      ...emptyProfile,
      paper: { ...emptyProfile.paper, doi: '' },
      resources: [
        {
          id: 'official-code',
          kind: 'git',
          label: 'Official code',
          sshUrl: 'git@github.com:example/robot.git',
          localPath: 'sources/official',
          chatAccess: 'indexed-read'
        }
      ],
      instructions: ['  Use the configured source.  ', '']
    }
    window.api.researchProfileLoad = vi.fn().mockResolvedValue(profile)
    window.api.researchSourceClone = vi.fn().mockResolvedValue({
      success: true,
      resourceId: 'official-code',
      localPath: '/project/sources/official',
      action: 'cloned',
      output: 'done'
    })

    render(<ResearchProfilePanel />)
    fireEvent.click(await screen.findByRole('button', { name: 'Clone' }))

    await waitFor(() =>
      expect(window.api.researchSourceClone).toHaveBeenCalledWith('official-code')
    )
    expect(window.api.researchProfileSave).toHaveBeenCalledWith({
      ...profile,
      paper: emptyProfile.paper,
      instructions: ['Use the configured source.']
    })
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining('existing Git/SSH credentials')
    )
    expect(await screen.findByText(/Cloned Official code/)).toHaveTextContent(
      '/project/sources/official'
    )
  })

  it('serializes repeated Git actions before React can disable their buttons', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    confirm.mockClear()
    const pendingSave = deferred<ResearchProfile>()
    const profile: ResearchProfile = {
      ...emptyProfile,
      resources: [
        {
          id: 'official-code',
          kind: 'git',
          label: 'Official code',
          localPath: 'sources/official',
          chatAccess: 'indexed-read'
        }
      ]
    }
    window.api.researchProfileLoad = vi.fn().mockResolvedValue(profile)
    window.api.researchProfileSave = vi.fn().mockReturnValue(pendingSave.promise)
    window.api.researchSourceClone = vi.fn().mockResolvedValue({
      success: true,
      resourceId: 'official-code',
      localPath: '/project/sources/official',
      action: 'cloned',
      output: ''
    })

    render(<ResearchProfilePanel />)
    const clone = await screen.findByRole('button', { name: 'Clone' })
    fireEvent.click(clone)
    fireEvent.click(clone)

    expect(window.confirm).toHaveBeenCalledOnce()
    expect(window.api.researchProfileSave).toHaveBeenCalledOnce()
    await act(async () => {
      pendingSave.resolve(profile)
      await pendingSave.promise
    })
    await waitFor(() => expect(window.api.researchSourceClone).toHaveBeenCalledOnce())
  })
})

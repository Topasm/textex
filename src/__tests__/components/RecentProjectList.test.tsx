import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RecentProjectList } from '../../renderer/components/home/RecentProjectList'
import { useSettingsStore } from '../../renderer/store/useSettingsStore'
import { openProject } from '../../renderer/utils/openProject'

vi.mock('../../renderer/utils/openProject', () => ({
  openProject: vi.fn()
}))

const recentProject = {
  path: '/projects/original',
  name: 'original',
  title: 'Original Project',
  lastOpened: new Date().toISOString()
}

const secondRecentProject = {
  path: '/projects/second',
  name: 'second',
  title: 'Second Project',
  lastOpened: new Date().toISOString()
}

describe('RecentProjectList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(openProject).mockResolvedValue({
      generation: 1,
      projectPath: recentProject.path
    })
    vi.mocked(window.api.openDirectory).mockResolvedValue(null)
    vi.mocked(window.api.removeRecentProject).mockResolvedValue({
      ...useSettingsStore.getState().settings,
      recentProjects: []
    })
    vi.mocked(window.api.updateRecentProject).mockResolvedValue({
      ...useSettingsStore.getState().settings,
      recentProjects: []
    })
  })

  it('opens path editing from the kebab menu and saves a typed path with Enter', async () => {
    const setRecentProjects = vi.fn()
    const nextProjects = [
      {
        ...recentProject,
        path: '/projects/updated',
        name: 'updated'
      }
    ]
    vi.mocked(window.api.updateRecentProject).mockResolvedValueOnce({
      ...useSettingsStore.getState().settings,
      recentProjects: nextProjects
    })

    render(
      <RecentProjectList recentProjects={[recentProject]} setRecentProjects={setRecentProjects} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit Path' }))

    const input = screen.getByDisplayValue('/projects/original')
    fireEvent.change(input, { target: { value: '/projects/updated' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(window.api.updateRecentProject).toHaveBeenCalledWith('/projects/original', {
        path: '/projects/updated'
      })
    })
    expect(setRecentProjects).toHaveBeenCalledWith(nextProjects)
  })

  it('fills the path input from the folder picker', async () => {
    const setRecentProjects = vi.fn()
    vi.mocked(window.api.openDirectory).mockResolvedValueOnce('/projects/browsed')

    render(
      <RecentProjectList recentProjects={[recentProject]} setRecentProjects={setRecentProjects} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit Path' }))
    fireEvent.click(screen.getByRole('button', { name: 'Browse' }))

    await waitFor(() => {
      expect(screen.getByDisplayValue('/projects/browsed')).toBeInTheDocument()
    })
  })

  it('keeps the path editor open and shows an inline error when saving fails', async () => {
    const setRecentProjects = vi.fn()
    vi.mocked(window.api.updateRecentProject).mockRejectedValueOnce(
      new Error('Recent project path not found')
    )

    render(
      <RecentProjectList recentProjects={[recentProject]} setRecentProjects={setRecentProjects} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit Path' }))
    fireEvent.change(screen.getByDisplayValue('/projects/original'), {
      target: { value: '/projects/missing' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByText('The selected folder does not exist or cannot be opened.')
    ).toBeInTheDocument()
    expect(screen.getByDisplayValue('/projects/missing')).toBeInTheDocument()
    expect(setRecentProjects).not.toHaveBeenCalled()
  })

  it('uses separate buttons for opening a project and its actions', async () => {
    const setRecentProjects = vi.fn()
    const { container } = render(
      <RecentProjectList recentProjects={[recentProject]} setRecentProjects={setRecentProjects} />
    )

    const openButton = screen.getByRole('button', { name: 'Original Project' })
    const menuButton = screen.getByRole('button', { name: 'More actions' })

    expect(openButton).not.toContainElement(menuButton)
    expect(container.querySelector('button button')).toBeNull()

    fireEvent.click(openButton)
    await waitFor(() => expect(openProject).toHaveBeenCalledWith('/projects/original'))
  })

  it('keeps a failed recent project and exposes an accessible retry', async () => {
    const setRecentProjects = vi.fn()
    vi.mocked(openProject)
      .mockRejectedValueOnce(new Error('Project directory not found'))
      .mockResolvedValueOnce({ generation: 2, projectPath: recentProject.path })

    render(
      <RecentProjectList recentProjects={[recentProject]} setRecentProjects={setRecentProjects} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Original Project' }))

    expect(
      await screen.findByText(
        'Could not open /projects/original: The selected folder does not exist or cannot be opened.'
      )
    ).toBeInTheDocument()
    expect(window.api.removeRecentProject).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'Replacement folder' })).toHaveValue(
      '/projects/original'
    )

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(openProject).toHaveBeenCalledTimes(2))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    })
  })

  it('validates and saves a browsed replacement without deleting the failed entry', async () => {
    const setRecentProjects = vi.fn()
    const replacementProjects = [
      { ...recentProject, path: '/projects/replacement', name: 'replacement' }
    ]
    vi.mocked(openProject).mockRejectedValueOnce(new Error('Project directory not found'))
    vi.mocked(window.api.openDirectory).mockResolvedValueOnce('/projects/replacement')
    vi.mocked(window.api.updateRecentProject).mockResolvedValueOnce({
      ...useSettingsStore.getState().settings,
      recentProjects: replacementProjects
    })

    render(
      <RecentProjectList recentProjects={[recentProject]} setRecentProjects={setRecentProjects} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Original Project' }))
    await screen.findByRole('button', { name: 'Retry' })
    fireEvent.click(screen.getByRole('button', { name: 'Browse' }))

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Replacement folder' })).toHaveValue(
        '/projects/replacement'
      )
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(window.api.updateRecentProject).toHaveBeenCalledWith('/projects/original', {
        path: '/projects/replacement'
      })
    })
    expect(setRecentProjects).toHaveBeenCalledWith(replacementProjects)
    expect(window.api.removeRecentProject).not.toHaveBeenCalled()
  })

  it('keeps recovery visible when the guarded retry is cancelled', async () => {
    const setRecentProjects = vi.fn()
    vi.mocked(openProject)
      .mockRejectedValueOnce(new Error('Project directory not found'))
      .mockResolvedValueOnce(null)

    render(
      <RecentProjectList recentProjects={[recentProject]} setRecentProjects={setRecentProjects} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Original Project' }))
    const retry = await screen.findByRole('button', { name: 'Retry' })
    fireEvent.click(retry)

    await waitFor(() => expect(openProject).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(window.api.removeRecentProject).not.toHaveBeenCalled()
  })

  it('keeps recovery and another project path editor state isolated', async () => {
    const setRecentProjects = vi.fn()
    vi.mocked(openProject).mockRejectedValueOnce(new Error('Project directory not found'))

    const { container } = render(
      <RecentProjectList
        recentProjects={[recentProject, secondRecentProject]}
        setRecentProjects={setRecentProjects}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Original Project' }))
    const recovery = await screen.findByRole('group', {
      name: /Could not open \/projects\/original/
    })
    const recoveryInput = within(recovery).getByRole('textbox', {
      name: 'Replacement folder'
    })
    fireEvent.change(recoveryInput, { target: { value: '/projects/original-replacement' } })

    const menuButtons = screen.getAllByRole('button', { name: 'More actions' })
    fireEvent.click(menuButtons[1])
    fireEvent.click(screen.getByRole('button', { name: 'Edit Path' }))

    const pathEditor = container.querySelector('.home-recent-item-path-editor')
    expect(pathEditor).not.toBeNull()
    const secondPathInput = within(pathEditor as HTMLElement).getByRole('textbox', {
      name: 'Replacement folder'
    })
    fireEvent.change(secondPathInput, { target: { value: '/projects/second-updated' } })
    fireEvent.click(within(pathEditor as HTMLElement).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(window.api.updateRecentProject).toHaveBeenNthCalledWith(1, '/projects/second', {
        path: '/projects/second-updated'
      })
    })
    expect(within(recovery).getByRole('textbox', { name: 'Replacement folder' })).toHaveValue(
      '/projects/original-replacement'
    )

    fireEvent.click(within(recovery).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(window.api.updateRecentProject).toHaveBeenNthCalledWith(2, '/projects/original', {
        path: '/projects/original-replacement'
      })
    })
  })

  it('only removes a failed recent project after the explicit remove action', async () => {
    const setRecentProjects = vi.fn()
    vi.mocked(openProject).mockRejectedValueOnce(new Error('Project directory not found'))

    render(
      <RecentProjectList recentProjects={[recentProject]} setRecentProjects={setRecentProjects} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Original Project' }))
    await screen.findByRole('button', { name: 'Retry' })
    expect(window.api.removeRecentProject).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => {
      expect(window.api.removeRecentProject).toHaveBeenCalledWith('/projects/original')
    })
    expect(setRecentProjects).toHaveBeenCalledWith([])
  })
})

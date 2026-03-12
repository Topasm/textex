import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RecentProjectList } from '../../renderer/components/home/RecentProjectList'

vi.mock('../../renderer/utils/openProject', () => ({
  openProject: vi.fn()
}))

const recentProject = {
  path: '/projects/original',
  name: 'original',
  title: 'Original Project',
  lastOpened: new Date().toISOString()
}

describe('RecentProjectList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(window.api.openDirectory).mockResolvedValue(null)
    vi.mocked(window.api.updateRecentProject).mockResolvedValue({ recentProjects: [] })
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
})

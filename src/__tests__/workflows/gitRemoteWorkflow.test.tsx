import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GitPanel from '../../renderer/components/GitPanel'
import { useProjectStore } from '../../renderer/store/useProjectStore'

const cleanStatus = {
  branch: 'main',
  files: [],
  staged: [],
  modified: [],
  not_added: []
}

const remoteStatus = {
  remote: 'origin',
  upstream: 'origin/main',
  ahead: 2,
  behind: 1
}

describe('safe Git remote workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useProjectStore.setState({
      projectRoot: '/project',
      isGitRepo: true,
      gitBranch: 'main',
      gitStatus: cleanStatus
    })
    vi.mocked(window.api.gitRemoteStatus).mockResolvedValue(remoteStatus)
    vi.mocked(window.api.gitStatus).mockResolvedValue(cleanStatus)
    vi.mocked(window.api.gitFetch).mockResolvedValue({ ...remoteStatus, behind: 0 })
    vi.mocked(window.api.gitPull).mockResolvedValue({ ...remoteStatus, behind: 0 })
    vi.mocked(window.api.gitPush).mockResolvedValue({ ...remoteStatus, ahead: 0 })
  })

  it('fetches without confirmation and confirms non-force push', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<GitPanel />)

    await screen.findByText('origin/main')
    await user.click(screen.getByRole('button', { name: 'Fetch' }))
    await waitFor(() => expect(window.api.gitFetch).toHaveBeenCalledWith('/project'))
    expect(confirm).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Push' }))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Force push is never used'))
    expect(window.api.gitPush).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Push' }))
    await waitFor(() => expect(window.api.gitPush).toHaveBeenCalledWith('/project'))
  })

  it('prevents pull while the worktree is dirty', async () => {
    useProjectStore.setState({
      gitStatus: {
        ...cleanStatus,
        files: [{ path: 'main.tex', index: ' ', working_dir: 'M' }],
        modified: ['main.tex']
      }
    })
    render(<GitPanel />)

    await screen.findByText('origin/main')
    const pull = screen.getByRole('button', { name: 'Pull' })
    expect(pull).toBeDisabled()
    expect(pull).toHaveAttribute('title', expect.stringContaining('Commit or stash'))
    fireEvent.click(pull)
    expect(window.api.gitPull).not.toHaveBeenCalled()
  })
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FileTree from '../../renderer/components/FileTree'
import { useProjectStore } from '../../renderer/store/useProjectStore'

const projectRoot = '/project'
const chaptersPath = `${projectRoot}/chapters`

describe('FileTree incremental refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useProjectStore.setState({
      projectRoot,
      directoryTree: [{ name: 'chapters', path: chaptersPath, type: 'directory' }],
      directoryRefreshVersions: {},
      projectIndex: null,
      gitStatus: null
    })
  })

  it('reloads only an invalidated expanded directory', async () => {
    vi.mocked(window.api.readDirectory)
      .mockResolvedValueOnce([{ name: 'old.tex', path: `${chaptersPath}/old.tex`, type: 'file' }])
      .mockResolvedValueOnce([{ name: 'new.tex', path: `${chaptersPath}/new.tex`, type: 'file' }])

    render(<FileTree />)

    // Root-level directories preserve the existing initially-expanded state;
    // collapse and expand to populate their lazy child cache.
    fireEvent.click(screen.getByText('chapters'))
    fireEvent.click(screen.getByText('chapters'))
    expect(await screen.findByText('old.tex')).toBeInTheDocument()

    useProjectStore.getState().invalidateDirectory(chaptersPath)

    expect(await screen.findByText('new.tex')).toBeInTheDocument()
    await waitFor(() => expect(window.api.readDirectory).toHaveBeenCalledTimes(2))
    expect(window.api.readDirectory).toHaveBeenNthCalledWith(1, chaptersPath)
    expect(window.api.readDirectory).toHaveBeenNthCalledWith(2, chaptersPath)
    expect(window.api.readDirectory).not.toHaveBeenCalledWith(projectRoot)
  })
})

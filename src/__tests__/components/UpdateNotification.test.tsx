import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UpdateNotification from '../../renderer/components/UpdateNotification'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { useUiStore } from '../../renderer/store/useUiStore'

const projectRoot = '/project'
const filePath = `${projectRoot}/draft.tex`

function setReadyWithDirtyDocument(): void {
  useProjectStore.getState().setProjectRoot(projectRoot)
  useEditorStore.getState().openFileInTab(filePath, 'saved')
  useEditorStore.getState().updateActiveDocument('unsaved', 'editor')
  useUiStore.setState({ updateStatus: 'ready', updateVersion: '1.0.10' })
}

describe('UpdateNotification restart lifecycle', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    useEditorStore.getState().resetEditor()
    useProjectStore.getState().setProjectRoot(null)
    useUiStore.setState({ updateStatus: 'idle', updateVersion: '' })
    vi.mocked(window.api.deactivateProject).mockResolvedValue({ success: true })
    vi.mocked(window.api.updateInstall).mockResolvedValue({ success: true })
  })

  it('does not deactivate or restart when dirty-document discard is cancelled', async () => {
    const user = userEvent.setup()
    setReadyWithDirtyDocument()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<UpdateNotification />)

    await user.click(screen.getByRole('button', { name: /restart|다시 시작/i }))

    expect(window.api.deactivateProject).not.toHaveBeenCalled()
    expect(window.api.updateInstall).not.toHaveBeenCalled()
    expect(useEditorStore.getState().openFiles[filePath]?.isDirty).toBe(true)
    expect(useUiStore.getState().updateStatus).toBe('ready')
  })

  it('restarts only after dirty confirmation and successful native deactivation', async () => {
    const user = userEvent.setup()
    setReadyWithDirtyDocument()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<UpdateNotification />)

    await user.click(screen.getByRole('button', { name: /restart|다시 시작/i }))
    await waitFor(() => expect(window.api.updateInstall).toHaveBeenCalledOnce())

    expect(window.api.deactivateProject).toHaveBeenCalledOnce()
    expect(vi.mocked(window.api.deactivateProject).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(window.api.updateInstall).mock.invocationCallOrder[0]
    )
  })

  it('does not restart when native deactivation fails', async () => {
    const user = userEvent.setup()
    setReadyWithDirtyDocument()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(window.api.deactivateProject).mockRejectedValue(new Error('shutdown failed'))
    render(<UpdateNotification />)

    await user.click(screen.getByRole('button', { name: /restart|다시 시작/i }))
    await waitFor(() => expect(useUiStore.getState().updateStatus).toBe('error'))

    expect(window.api.updateInstall).not.toHaveBeenCalled()
  })
})

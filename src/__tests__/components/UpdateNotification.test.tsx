import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UpdateNotification from '../../renderer/components/UpdateNotification'
import { useEditorStore } from '../../renderer/store/useEditorStore'
import { useProjectStore } from '../../renderer/store/useProjectStore'
import { useUiStore } from '../../renderer/store/useUiStore'
import { setResearchProfileDraftDirty } from '../../renderer/services/researchProfileDraft'
import type { AppUpdateActionResult, AppUpdateMetadata } from '../../shared/types'

const projectRoot = '/project'
const filePath = `${projectRoot}/draft.tex`
const update: AppUpdateMetadata = {
  currentVersion: '1.0.9',
  version: '1.0.10',
  date: '2026-08-20T12:00:00Z',
  body: 'Faster editing\nSafer project transitions'
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

function setUpdateStatus(status: 'available' | 'ready'): void {
  useUiStore.setState({ updateStatus: status, updateMetadata: update })
}

function setReadyWithDirtyDocument(): void {
  useProjectStore.getState().setProjectRoot(projectRoot)
  useEditorStore.getState().openFileInTab(filePath, 'saved')
  useEditorStore.getState().updateActiveDocument('unsaved', 'editor')
  setUpdateStatus('ready')
}

describe('UpdateNotification', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    localStorage.clear()
    useEditorStore.getState().resetEditor()
    useProjectStore.getState().setProjectRoot(null)
    setResearchProfileDraftDirty(false)
    useUiStore.setState({
      updateStatus: 'idle',
      updateMetadata: null,
      updateProgress: null,
      updateError: '',
      updateErrorAction: null
    })
    vi.mocked(window.api.deactivateProject).mockResolvedValue({ success: true })
    vi.mocked(window.api.updateDownload).mockResolvedValue({ success: true })
    vi.mocked(window.api.updateInstall).mockResolvedValue({ success: true })
    vi.mocked(window.api.openExternal).mockResolvedValue({ success: true })
  })

  it('shows signed metadata as text and opens a fixed-origin release URL', async () => {
    const user = userEvent.setup()
    setUpdateStatus('available')
    render(<UpdateNotification />)

    const notification = screen.getByRole('status', { name: /application update/i })
    expect(notification).toHaveTextContent('1.0.10')
    expect(notification).toHaveClass('app-update-notification')
    await user.click(screen.getByText(/release notes/i))
    expect(screen.getByText(/Faster editing/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /view release/i }))
    expect(window.api.openExternal).toHaveBeenCalledWith(
      'https://github.com/Topasm/textex/releases/tag/v1.0.10'
    )
  })

  it('announces checking, up-to-date, and restarting states without active-state dismissal', () => {
    useUiStore.setState({ updateStatus: 'checking' })
    render(<UpdateNotification />)

    expect(screen.getByRole('status')).toHaveTextContent(/checking for updates/i)
    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument()

    act(() => useUiStore.setState({ updateStatus: 'up-to-date' }))
    expect(screen.getByRole('status')).toHaveTextContent(/up to date/i)
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument()

    act(() => useUiStore.setState({ updateStatus: 'restarting', updateMetadata: update }))
    expect(screen.getByRole('status')).toHaveTextContent(/restarting/i)
    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument()
  })

  it('deduplicates download clicks and exposes determinate progress accessibly', async () => {
    const result = deferred<AppUpdateActionResult>()
    let publishProgress: Parameters<typeof window.api.updateDownload>[0]
    vi.mocked(window.api.updateDownload).mockImplementation((onProgress) => {
      publishProgress = onProgress
      return result.promise
    })
    setUpdateStatus('available')
    render(<UpdateNotification />)

    const download = screen.getByRole('button', { name: /^download$/i })
    fireEvent.click(download)
    fireEvent.click(download)

    expect(window.api.updateDownload).toHaveBeenCalledOnce()
    const progress = screen.getByRole('progressbar', { name: /download progress/i })
    expect(progress).not.toHaveAttribute('value')

    act(() => {
      publishProgress?.({ downloaded: 25, contentLength: 100, percent: 25 })
    })
    expect(progress).toHaveAttribute('value', '25')
    expect(screen.getByRole('status')).toHaveTextContent('25%')

    await act(async () => {
      result.resolve({ success: true })
      await result.promise
    })
    expect(screen.getByRole('button', { name: /restart/i })).toBeInTheDocument()
  })

  it('does not deactivate or restart when dirty-document discard is cancelled', async () => {
    const user = userEvent.setup()
    setReadyWithDirtyDocument()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<UpdateNotification />)

    await user.click(screen.getByRole('button', { name: /restart|다시 시작/i }))
    await waitFor(() => expect(useUiStore.getState().updateStatus).toBe('ready'))

    expect(window.api.deactivateProject).not.toHaveBeenCalled()
    expect(window.api.updateInstall).not.toHaveBeenCalled()
    expect(useEditorStore.getState().openFiles[filePath]?.isDirty).toBe(true)
  })

  it('keeps the research draft guard on updater restart', async () => {
    const user = userEvent.setup()
    useProjectStore.getState().setProjectRoot(projectRoot)
    setResearchProfileDraftDirty(true)
    setUpdateStatus('ready')
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<UpdateNotification />)

    await user.click(screen.getByRole('button', { name: /restart|다시 시작/i }))
    await waitFor(() => expect(useUiStore.getState().updateStatus).toBe('ready'))

    expect(window.api.deactivateProject).not.toHaveBeenCalled()
    expect(window.api.updateInstall).not.toHaveBeenCalled()
  })

  it('deduplicates restart clicks after dirty confirmation and native deactivation', async () => {
    setReadyWithDirtyDocument()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const install = deferred<AppUpdateActionResult>()
    vi.mocked(window.api.updateInstall).mockReturnValue(install.promise)
    render(<UpdateNotification />)

    const restart = screen.getByRole('button', { name: /restart|다시 시작/i })
    fireEvent.click(restart)
    fireEvent.click(restart)
    await waitFor(() => expect(window.api.updateInstall).toHaveBeenCalledOnce())

    expect(window.api.deactivateProject).toHaveBeenCalledOnce()
    expect(vi.mocked(window.api.deactivateProject).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(window.api.updateInstall).mock.invocationCallOrder[0]
    )

    await act(async () => {
      install.resolve({ success: true })
      await install.promise
    })
    expect(useUiStore.getState().updateStatus).toBe('restarting')
  })

  it('announces native restart failures and offers a retry', async () => {
    const user = userEvent.setup()
    setReadyWithDirtyDocument()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(window.api.deactivateProject).mockRejectedValue(new Error('shutdown failed'))
    render(<UpdateNotification />)

    await user.click(screen.getByRole('button', { name: /restart|다시 시작/i }))
    const alert = await screen.findByRole('alert')

    expect(alert).toHaveTextContent('shutdown failed')
    expect(screen.getByRole('button', { name: /try again|다시 시도/i })).toBeInTheDocument()
    expect(window.api.updateInstall).not.toHaveBeenCalled()
  })
})

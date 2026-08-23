import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkForAppUpdate,
  downloadAppUpdate,
  retryAppUpdate
} from '../../renderer/services/updateLifecycle'
import { useUiStore } from '../../renderer/store/useUiStore'
import type {
  AppUpdateActionResult,
  AppUpdateCheckResult,
  AppUpdateDownloadProgress,
  AppUpdateMetadata
} from '../../shared/types'

const update: AppUpdateMetadata = {
  currentVersion: '1.0.9',
  version: '1.0.10',
  date: '2026-08-20T12:00:00Z',
  body: 'Release notes'
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

describe('update lifecycle', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    localStorage.clear()
    useUiStore.setState({
      updateStatus: 'idle',
      updateMetadata: null,
      updateProgress: null,
      updateError: '',
      updateErrorAction: null
    })
    vi.mocked(window.api.updateCheck).mockResolvedValue({ success: true, update: null })
    vi.mocked(window.api.updateDownload).mockResolvedValue({ success: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps automatic check failures non-intrusive', async () => {
    vi.mocked(window.api.updateCheck).mockResolvedValue({
      success: false,
      error: 'offline'
    })

    await checkForAppUpdate({ interactive: false })

    expect(window.api.updateCheck).toHaveBeenCalledOnce()
    expect(useUiStore.getState().updateStatus).toBe('idle')
    expect(useUiStore.getState().updateError).toBe('')
  })

  it('shows manual checking and a transient up-to-date result', async () => {
    vi.useFakeTimers()
    const result = deferred<AppUpdateCheckResult>()
    vi.mocked(window.api.updateCheck).mockReturnValue(result.promise)

    const checking = checkForAppUpdate({ interactive: true })
    expect(useUiStore.getState().updateStatus).toBe('checking')

    result.resolve({ success: true, update: null })
    await checking
    expect(useUiStore.getState().updateStatus).toBe('up-to-date')

    await vi.advanceTimersByTimeAsync(4_000)
    expect(useUiStore.getState().updateStatus).toBe('idle')
  })

  it('promotes a silent in-flight check and deduplicates the native request', async () => {
    const result = deferred<AppUpdateCheckResult>()
    vi.mocked(window.api.updateCheck).mockReturnValue(result.promise)

    const automatic = checkForAppUpdate({ interactive: false })
    const manual = checkForAppUpdate({ interactive: true })
    expect(automatic).toBe(manual)
    expect(window.api.updateCheck).toHaveBeenCalledOnce()
    expect(useUiStore.getState().updateStatus).toBe('checking')

    result.resolve({ success: true, update })
    await manual
    expect(useUiStore.getState()).toMatchObject({
      updateStatus: 'available',
      updateMetadata: update
    })
  })

  it('hides a dismissed automatic result but shows the same version after a manual check', async () => {
    localStorage.setItem('textex-dismissed-update-version', update.version)
    vi.mocked(window.api.updateCheck).mockResolvedValue({ success: true, update })

    await checkForAppUpdate({ interactive: false })
    expect(useUiStore.getState().updateStatus).toBe('idle')

    await checkForAppUpdate({ interactive: true })
    expect(window.api.updateCheck).toHaveBeenCalledTimes(2)
    expect(useUiStore.getState().updateStatus).toBe('available')
    expect(localStorage.getItem('textex-dismissed-update-version')).toBeNull()
  })

  it('ignores late progress from a failed download after a retry starts', async () => {
    const callbacks: Array<((progress: AppUpdateDownloadProgress) => void) | undefined> = []
    const retryResult = deferred<AppUpdateActionResult>()
    vi.mocked(window.api.updateDownload)
      .mockImplementationOnce(async (onProgress) => {
        callbacks.push(onProgress)
        return { success: false, error: 'network interrupted' }
      })
      .mockImplementationOnce((onProgress) => {
        callbacks.push(onProgress)
        return retryResult.promise
      })
    useUiStore.setState({ updateStatus: 'available', updateMetadata: update })

    await downloadAppUpdate()
    expect(useUiStore.getState()).toMatchObject({
      updateStatus: 'error',
      updateErrorAction: 'download'
    })

    const retry = retryAppUpdate()
    callbacks[0]?.({ downloaded: 90, contentLength: 100, percent: 90 })
    expect(useUiStore.getState().updateProgress).toBeNull()
    callbacks[1]?.({ downloaded: 20, contentLength: 100, percent: 20 })
    expect(useUiStore.getState().updateProgress).toBe(20)

    retryResult.resolve({ success: true })
    await retry
    expect(useUiStore.getState().updateStatus).toBe('ready')
  })
})

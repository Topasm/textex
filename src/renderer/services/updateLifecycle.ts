import type { AppUpdateMetadata } from '../../shared/types'
import { useUiStore, type UpdateErrorAction } from '../store/useUiStore'
import { errorMessage } from '../utils/errorMessage'
import { restartAfterUpdate } from './applicationLifecycle'

const DISMISSED_UPDATE_KEY = 'textex-dismissed-update-version'
const UP_TO_DATE_VISIBLE_MS = 4_000
const RELEASES_URL = 'https://github.com/Topasm/textex/releases'

interface CheckForAppUpdateOptions {
  interactive?: boolean
}

let lifecycleGeneration = 0
let checkRequest: Promise<void> | null = null
let checkInteractive = false
let downloadRequest: Promise<void> | null = null
let restartRequest: Promise<void> | null = null
let transientTimer: number | null = null

function clearTransientTimer(): void {
  if (transientTimer === null) return
  window.clearTimeout(transientTimer)
  transientTimer = null
}

function nextGeneration(): number {
  clearTransientTimer()
  lifecycleGeneration += 1
  return lifecycleGeneration
}

function isCurrent(generation: number): boolean {
  return generation === lifecycleGeneration
}

function resultError(error: unknown, fallback: string): string {
  const message = errorMessage(error).trim()
  return message && message !== 'undefined' ? message : fallback
}

function readDismissedVersion(): string | null {
  try {
    return localStorage.getItem(DISMISSED_UPDATE_KEY)
  } catch {
    return null
  }
}

function clearDismissedVersion(): void {
  try {
    localStorage.removeItem(DISMISSED_UPDATE_KEY)
  } catch {
    // Persistence is optional; the manual result must still be shown.
  }
}

function rememberDismissedVersion(version: string): void {
  try {
    localStorage.setItem(DISMISSED_UPDATE_KEY, version)
  } catch {
    // Persistence is optional.
  }
}

function setIdle(): void {
  useUiStore.setState({
    updateStatus: 'idle',
    updateMetadata: null,
    updateProgress: null,
    updateError: '',
    updateErrorAction: null
  })
}

function setError(action: UpdateErrorAction, message: string): void {
  useUiStore.setState({
    updateStatus: 'error',
    updateProgress: null,
    updateError: message,
    updateErrorAction: action
  })
}

function showUpToDateBriefly(generation: number): void {
  useUiStore.setState({
    updateStatus: 'up-to-date',
    updateMetadata: null,
    updateProgress: null,
    updateError: '',
    updateErrorAction: null
  })
  transientTimer = window.setTimeout(() => {
    transientTimer = null
    if (isCurrent(generation) && useUiStore.getState().updateStatus === 'up-to-date') setIdle()
  }, UP_TO_DATE_VISIBLE_MS)
}

function publishAvailable(update: AppUpdateMetadata, interactive: boolean): void {
  if (!interactive && readDismissedVersion() === update.version) {
    setIdle()
    return
  }
  useUiStore.setState({
    updateStatus: 'available',
    updateMetadata: update,
    updateProgress: null,
    updateError: '',
    updateErrorAction: null
  })
}

/**
 * Runs both launch-time and menu-triggered checks through one request. A menu
 * check promotes an already-running silent check to visible feedback.
 */
export function checkForAppUpdate({
  interactive = false
}: CheckForAppUpdateOptions = {}): Promise<void> {
  if (interactive) clearDismissedVersion()

  if (checkRequest) {
    if (interactive) {
      checkInteractive = true
      useUiStore.setState({
        updateStatus: 'checking',
        updateMetadata: null,
        updateProgress: null,
        updateError: '',
        updateErrorAction: null
      })
    }
    return checkRequest
  }

  const status = useUiStore.getState().updateStatus
  if (
    status === 'available' ||
    status === 'downloading' ||
    status === 'ready' ||
    status === 'restarting'
  ) {
    return Promise.resolve()
  }
  if (!interactive && status !== 'idle') return Promise.resolve()

  const generation = nextGeneration()
  checkInteractive = interactive
  if (interactive) {
    useUiStore.setState({
      updateStatus: 'checking',
      updateMetadata: null,
      updateProgress: null,
      updateError: '',
      updateErrorAction: null
    })
  }

  const request = (async (): Promise<void> => {
    try {
      const result = await window.api.updateCheck()
      if (!isCurrent(generation)) return
      if (!result.success) {
        if (checkInteractive) {
          setError('check', resultError(result.error, 'Could not check for updates.'))
        }
        return
      }
      if (!result.update) {
        if (checkInteractive) showUpToDateBriefly(generation)
        return
      }
      publishAvailable(result.update, checkInteractive)
    } catch (error) {
      if (isCurrent(generation) && checkInteractive) {
        setError('check', resultError(error, 'Could not check for updates.'))
      }
    }
  })().finally(() => {
    if (checkRequest === request) checkRequest = null
    checkInteractive = false
  })
  checkRequest = request
  return request
}

export function downloadAppUpdate(): Promise<void> {
  if (downloadRequest) return downloadRequest

  const state = useUiStore.getState()
  const canRetry = state.updateStatus === 'error' && state.updateErrorAction === 'download'
  if ((state.updateStatus !== 'available' && !canRetry) || !state.updateMetadata) {
    return Promise.resolve()
  }

  const generation = nextGeneration()
  useUiStore.setState({
    updateStatus: 'downloading',
    updateProgress: null,
    updateError: '',
    updateErrorAction: null
  })

  const request = (async (): Promise<void> => {
    try {
      const result = await window.api.updateDownload((progress) => {
        if (!isCurrent(generation) || useUiStore.getState().updateStatus !== 'downloading') return
        useUiStore.getState().setUpdateProgress(progress.percent)
      })
      if (!isCurrent(generation)) return
      if (!result.success) {
        setError('download', resultError(result.error, 'Could not download the update.'))
        return
      }
      useUiStore.setState({
        updateStatus: 'ready',
        updateProgress: 100,
        updateError: '',
        updateErrorAction: null
      })
    } catch (error) {
      if (isCurrent(generation)) {
        setError('download', resultError(error, 'Could not download the update.'))
      }
    }
  })().finally(() => {
    if (downloadRequest === request) downloadRequest = null
  })
  downloadRequest = request
  return request
}

export function restartAppUpdate(): Promise<void> {
  if (restartRequest) return restartRequest

  const state = useUiStore.getState()
  const canRetry = state.updateStatus === 'error' && state.updateErrorAction === 'restart'
  if ((state.updateStatus !== 'ready' && !canRetry) || !state.updateMetadata) {
    return Promise.resolve()
  }

  const generation = nextGeneration()
  useUiStore.setState({
    updateStatus: 'restarting',
    updateError: '',
    updateErrorAction: null
  })

  const request = (async (): Promise<void> => {
    try {
      const result = await restartAfterUpdate()
      if (!isCurrent(generation)) return
      if (result === 'cancelled') {
        useUiStore.setState({ updateStatus: 'ready' })
      } else if (result === 'failed') {
        setError('restart', 'The updater could not request an application restart.')
      }
      // On success, keep the restarting state visible until Tauri exits.
    } catch (error) {
      if (isCurrent(generation)) {
        setError('restart', resultError(error, 'Could not restart the application.'))
      }
    }
  })().finally(() => {
    if (restartRequest === request) restartRequest = null
  })
  restartRequest = request
  return request
}

export function retryAppUpdate(): Promise<void> {
  switch (useUiStore.getState().updateErrorAction) {
    case 'download':
      return downloadAppUpdate()
    case 'restart':
      return restartAppUpdate()
    default:
      return checkForAppUpdate({ interactive: true })
  }
}

export function dismissAppUpdate(): void {
  const state = useUiStore.getState()
  if (!['available', 'up-to-date', 'ready', 'error'].includes(state.updateStatus)) return
  if (state.updateMetadata?.version) rememberDismissedVersion(state.updateMetadata.version)
  nextGeneration()
  setIdle()
}

export function appUpdateReleaseUrl(version: string): string {
  const normalized = version.trim().replace(/^v/u, '')
  return normalized ? `${RELEASES_URL}/tag/v${encodeURIComponent(normalized)}` : RELEASES_URL
}

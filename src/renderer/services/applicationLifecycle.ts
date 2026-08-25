import { deactivateProject } from '../utils/openProject'

let pendingExitPreparation: Promise<boolean> | null = null

/** Confirms every dirty tab and waits for native project resources to stop. */
export function prepareForApplicationExit(): Promise<boolean> {
  if (pendingExitPreparation) return pendingExitPreparation

  const preparation = deactivateProject().finally(() => {
    if (pendingExitPreparation === preparation) pendingExitPreparation = null
  })
  pendingExitPreparation = preparation
  return preparation
}

/**
 * macOS convention keeps the application and its document state alive when the
 * last window is closed. Other desktop platforms retain close-to-exit behavior.
 */
export async function handleWindowCloseRequest(): Promise<boolean> {
  if (document.documentElement.dataset.platform === 'darwin') {
    await window.api.hideWindow()
    return false
  }
  return prepareForApplicationExit()
}

export async function quitApplication(): Promise<boolean> {
  if (!(await prepareForApplicationExit())) return false
  const result = await window.api.exitApp()
  return result.success
}

export type UpdateRestartResult = 'cancelled' | 'requested' | 'failed'

export async function restartAfterUpdate(): Promise<UpdateRestartResult> {
  if (!(await prepareForApplicationExit())) return 'cancelled'
  const result = await window.api.updateInstall()
  return result.success ? 'requested' : 'failed'
}

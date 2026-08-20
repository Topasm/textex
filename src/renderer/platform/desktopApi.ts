import type { DesktopApi } from '../types/api'

function hasDesktopApi(value: unknown): value is DesktopApi {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Partial<DesktopApi>
  return (
    typeof candidate.openDirectory === 'function' &&
    typeof candidate.readFile === 'function' &&
    typeof candidate.saveFile === 'function'
  )
}

/**
 * Installs the runtime-specific backend before React mounts.
 *
 * Electron's context bridge populates window.api before renderer scripts run,
 * so that implementation always wins. The Tauri module is loaded lazily to
 * keep it out of Electron's initial renderer chunk.
 */
export async function installDesktopApi(): Promise<void> {
  if (hasDesktopApi(window.api)) {
    document.documentElement.dataset.desktopRuntime = 'electron'
    return
  }

  const { isTauri } = await import('@tauri-apps/api/core')
  if (!isTauri()) {
    throw new Error('TextEx requires either the Electron preload or Tauri runtime')
  }

  const { createTauriApi } = await import('./tauriApi')
  window.api = createTauriApi()
  document.documentElement.dataset.desktopRuntime = 'tauri'
}

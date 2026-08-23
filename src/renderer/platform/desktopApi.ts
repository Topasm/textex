/**
 * Installs the Tauri backend before React mounts.
 *
 * Runtime validation happens before assigning the typed window.api bridge so a
 * browser preview or pre-existing global cannot silently run without Tauri's
 * native security boundary.
 */
export async function installDesktopApi(): Promise<void> {
  const { isTauri } = await import('@tauri-apps/api/core')
  if (!isTauri()) {
    throw new Error('TextEx requires the Tauri desktop runtime')
  }

  const { createTauriApi } = await import('./tauriApi')
  window.api = createTauriApi()
  document.documentElement.dataset.desktopRuntime = 'tauri'
}

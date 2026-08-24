import type { RendererSessionSnapshot, UserSettings } from '../../shared/types'
import { MAX_RENDERER_SESSION_ENTRY_BYTES } from '../../shared/defaultSettings'
import { useEditorStore } from '../store/useEditorStore'
import { usePdfStore } from '../store/usePdfStore'
import { useProjectStore } from '../store/useProjectStore'

const SESSION_STORAGE_KEYS = {
  editor: 'textex-editor-session',
  project: 'textex-project-storage',
  pdf: 'textex-pdf-layout'
} as const

const SESSION_SYNC_DELAY_MS = 500

type SessionStorage = Pick<Storage, 'getItem' | 'setItem'>

function validPersistedStore(raw: string | null): raw is string {
  if (!raw || raw.length > MAX_RENDERER_SESSION_ENTRY_BYTES) return false
  try {
    const parsed = JSON.parse(raw) as unknown
    return Boolean(parsed && typeof parsed === 'object')
  } catch {
    return false
  }
}

export function readRendererSessionSnapshot(storage: SessionStorage): RendererSessionSnapshot {
  const snapshot: RendererSessionSnapshot = { version: 1 }
  for (const [name, key] of Object.entries(SESSION_STORAGE_KEYS)) {
    const raw = storage.getItem(key)
    if (validPersistedStore(raw)) {
      snapshot[name as keyof typeof SESSION_STORAGE_KEYS] = raw
    }
  }
  return snapshot
}

export function restoreRendererSessionSnapshot(
  storage: SessionStorage,
  snapshot: RendererSessionSnapshot | undefined
): boolean {
  if (!snapshot || snapshot.version !== 1) return false

  let restored = false
  for (const [name, key] of Object.entries(SESSION_STORAGE_KEYS)) {
    if (storage.getItem(key) !== null) continue
    const raw = snapshot[name as keyof typeof SESSION_STORAGE_KEYS]
    if (typeof raw !== 'string' || !validPersistedStore(raw)) continue
    storage.setItem(key, raw)
    restored = true
  }
  return restored
}

function hasSessionData(snapshot: RendererSessionSnapshot): boolean {
  return Boolean(snapshot.editor || snapshot.project || snapshot.pdf)
}

let installed = false

export async function installRendererSessionBridge(
  nativeSettings: UserSettings | undefined
): Promise<void> {
  if (installed) return
  installed = true

  try {
    const restored = restoreRendererSessionSnapshot(localStorage, nativeSettings?.rendererSession)
    if (restored) {
      await Promise.all([
        useEditorStore.persist.rehydrate(),
        useProjectStore.persist.rehydrate(),
        usePdfStore.persist.rehydrate()
      ])
    }
  } catch {
    // Session restoration is best-effort. Synchronization still needs to be
    // installed so a later renderer change can repair the native snapshot.
  }

  let syncTimer: ReturnType<typeof setTimeout> | undefined
  const sync = (): void => {
    clearTimeout(syncTimer)
    syncTimer = setTimeout(() => {
      try {
        const rendererSession = readRendererSessionSnapshot(localStorage)
        if (!hasSessionData(rendererSession)) return
        window.api.saveSettings({ rendererSession }).catch(() => {})
      } catch {
        // Persisted WebView storage may be unavailable during shutdown.
      }
    }, SESSION_SYNC_DELAY_MS)
  }

  useEditorStore.subscribe(sync)
  useProjectStore.subscribe(sync)
  usePdfStore.subscribe(sync)

  try {
    const rendererSession = readRendererSessionSnapshot(localStorage)
    if (hasSessionData(rendererSession)) {
      await window.api.saveSettings({ rendererSession })
    }
  } catch {
    // Initial native synchronization must not block application startup.
  }
}

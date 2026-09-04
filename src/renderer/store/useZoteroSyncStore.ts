import { create } from 'zustand'

interface ZoteroSyncState {
  dataRevision: number
  configurationRevision: number
  markDataChanged: () => void
  markConfigurationChanged: () => void
}

function nextRevision(current: number): number {
  return current === Number.MAX_SAFE_INTEGER ? 0 : current + 1
}

/** Small cross-panel signal store; Zotero data itself remains in feature caches. */
export const useZoteroSyncStore = create<ZoteroSyncState>((set) => ({
  dataRevision: 0,
  configurationRevision: 0,
  markDataChanged: () => set((state) => ({ dataRevision: nextRevision(state.dataRevision) })),
  markConfigurationChanged: () =>
    set((state) => ({ configurationRevision: nextRevision(state.configurationRevision) }))
}))

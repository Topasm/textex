import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AiContextEntry } from '../../shared/types'

interface AiContextState {
  entries: Record<string, AiContextEntry>
  upsertEntry: (entry: AiContextEntry) => void
  removeEntry: (filePath: string) => void
  clear: () => void
}

export const useAiContextStore = create<AiContextState>()(
  persist(
    (set) => ({
      entries: {},
      upsertEntry: (entry) =>
        set((state) => ({
          entries: {
            ...state.entries,
            [entry.filePath]: entry
          }
        })),
      removeEntry: (filePath) =>
        set((state) => {
          const entries = { ...state.entries }
          delete entries[filePath]
          return { entries }
        }),
      clear: () => set({ entries: {} })
    }),
    {
      name: 'textex-ai-context'
    }
  )
)

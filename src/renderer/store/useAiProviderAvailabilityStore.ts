import { create } from 'zustand'
import type { AiProvider } from '../../shared/types'

export type AiProviderAvailability = Record<AiProvider, boolean | null>

export const INITIAL_AI_PROVIDER_AVAILABILITY: AiProviderAvailability = {
  anthropic: null,
  openai: null,
  gemini: null,
  'claude-cli': null,
  'codex-cli': null
}

interface AiProviderAvailabilityState {
  availability: AiProviderAvailability
  checking: boolean
  checked: boolean
  refreshGeneration: number
  refresh: () => Promise<void>
  setAvailability: (availability: AiProviderAvailability) => void
  markAvailable: (provider: AiProvider) => void
}

export const useAiProviderAvailabilityStore = create<AiProviderAvailabilityState>((set, get) => ({
  availability: INITIAL_AI_PROVIDER_AVAILABILITY,
  checking: false,
  checked: false,
  refreshGeneration: 0,
  refresh: async () => {
    const generation = get().refreshGeneration + 1
    set({ checking: true, refreshGeneration: generation })
    const results = await Promise.allSettled([
      window.api.aiHasApiKey('anthropic'),
      window.api.aiHasApiKey('openai'),
      window.api.aiHasApiKey('gemini'),
      window.api.aiCheckCli(),
      window.api.aiCheckCodexCli()
    ])
    if (get().refreshGeneration !== generation) return
    set({
      availability: {
        anthropic: results[0].status === 'fulfilled' && results[0].value,
        openai: results[1].status === 'fulfilled' && results[1].value,
        gemini: results[2].status === 'fulfilled' && results[2].value,
        'claude-cli': results[3].status === 'fulfilled' && results[3].value.available,
        'codex-cli': results[4].status === 'fulfilled' && results[4].value.available
      },
      checked: true,
      checking: false
    })
  },
  setAvailability: (availability) => set({ availability, checked: true, checking: false }),
  markAvailable: (provider) =>
    set((state) => ({
      availability: { ...state.availability, [provider]: true },
      checked: true
    }))
}))

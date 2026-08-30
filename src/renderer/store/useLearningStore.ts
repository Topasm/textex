import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  isLearningHintId,
  isTourItemId,
  type LearningHintId,
  type TourItemId
} from '../../shared/learningIds'

export const LEARNING_STORAGE_KEY = 'textex-learning-v1'

interface LearningState {
  dismissedHintIds: readonly LearningHintId[]
  completedTourItemIds: readonly TourItemId[]
  dismissHint: (id: LearningHintId) => void
  resetHints: () => void
  setTourItemComplete: (id: TourItemId, complete: boolean) => void
  resetTour: () => void
}

function uniqueKnownValues<T extends string>(
  value: unknown,
  guard: (entry: unknown) => entry is T
): T[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter(guard))]
}

export function sanitizeLearningState(input: unknown): {
  dismissedHintIds: LearningHintId[]
  completedTourItemIds: TourItemId[]
} {
  if (!input || typeof input !== 'object') {
    return { dismissedHintIds: [], completedTourItemIds: [] }
  }
  const value = input as Record<string, unknown>
  return {
    dismissedHintIds: uniqueKnownValues(value.dismissedHintIds, isLearningHintId),
    completedTourItemIds: uniqueKnownValues(value.completedTourItemIds, isTourItemId)
  }
}

export const useLearningStore = create<LearningState>()(
  persist(
    (set) => ({
      dismissedHintIds: [],
      completedTourItemIds: [],
      dismissHint: (id) =>
        set((state) =>
          state.dismissedHintIds.includes(id)
            ? state
            : { dismissedHintIds: [...state.dismissedHintIds, id] }
        ),
      resetHints: () => set({ dismissedHintIds: [] }),
      setTourItemComplete: (id, complete) =>
        set((state) => ({
          completedTourItemIds: complete
            ? state.completedTourItemIds.includes(id)
              ? state.completedTourItemIds
              : [...state.completedTourItemIds, id]
            : state.completedTourItemIds.filter((entry) => entry !== id)
        })),
      resetTour: () => set({ completedTourItemIds: [] })
    }),
    {
      name: LEARNING_STORAGE_KEY,
      version: 1,
      merge: (persisted, current) => ({
        ...current,
        ...sanitizeLearningState(persisted)
      }),
      partialize: (state) => ({
        dismissedHintIds: state.dismissedHintIds,
        completedTourItemIds: state.completedTourItemIds
      })
    }
  )
)

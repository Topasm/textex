// Keep the tiny persisted-state vocabulary independent from learnCatalog.ts.
// The feature-hint startup path needs these guards but must not eagerly pull
// the full, localized Help Center catalog into the application shell bundle.
export const LEARN_SECTION_IDS = [
  'tour',
  'quick-start',
  'gestures',
  'writing',
  'research',
  'ai',
  'project',
  'shortcuts'
] as const

export type LearnSectionId = (typeof LEARN_SECTION_IDS)[number]

export const TOUR_ITEM_IDS = [
  'tour-edit',
  'tour-compile',
  'tour-prose',
  'tour-references',
  'tour-sync',
  'tour-submission',
  'tour-export'
] as const

export type TourItemId = (typeof TOUR_ITEM_IDS)[number]

export const LEARNING_HINT_IDS = [
  'workspace-pair-swipe',
  'pdf-page-swipe',
  'panel-tab-swipe',
  'source-pdf-sync'
] as const

export type LearningHintId = (typeof LEARNING_HINT_IDS)[number]

export function isLearnSectionId(value: unknown): value is LearnSectionId {
  return typeof value === 'string' && LEARN_SECTION_IDS.includes(value as LearnSectionId)
}

export function isLearningHintId(value: unknown): value is LearningHintId {
  return typeof value === 'string' && LEARNING_HINT_IDS.includes(value as LearningHintId)
}

export function isTourItemId(value: unknown): value is TourItemId {
  return typeof value === 'string' && TOUR_ITEM_IDS.includes(value as TourItemId)
}

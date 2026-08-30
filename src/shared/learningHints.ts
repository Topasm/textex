import type { LearningHintId, LearnSectionId } from './learningIds'

export type { LearningHintId } from './learningIds'

// This startup-only list deliberately stays separate from the lazy guide
// catalog. A hint needs only an id, translation key, and destination section.

export interface LearningHint {
  readonly id: LearningHintId
  readonly messageKey: string
  readonly sectionId: LearnSectionId
}

export const LEARNING_HINTS: readonly LearningHint[] = [
  {
    id: 'workspace-pair-swipe',
    messageKey: 'learning.hints.workspaceSwipe',
    sectionId: 'gestures'
  },
  {
    id: 'pdf-page-swipe',
    messageKey: 'learning.hints.pdfPageSwipe',
    sectionId: 'gestures'
  },
  {
    id: 'panel-tab-swipe',
    messageKey: 'learning.hints.panelTabSwipe',
    sectionId: 'gestures'
  },
  {
    id: 'source-pdf-sync',
    messageKey: 'learning.hints.sourcePdfSync',
    sectionId: 'writing'
  }
]

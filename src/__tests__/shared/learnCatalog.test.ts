import { describe, expect, it } from 'vitest'
import { APP_COMMAND_MANIFEST } from '../../shared/appCommandManifest'
import { LEARN_ITEMS, LEARN_SECTIONS, TOUR_ITEMS } from '../../shared/learnCatalog'
import { LEARNING_HINTS } from '../../shared/learningHints'
import { LEARN_SECTION_IDS, TOUR_ITEM_IDS } from '../../shared/learningIds'
import { sanitizeLearningState } from '../../renderer/store/useLearningStore'

describe('learn catalog', () => {
  it('keeps section, item, hint, and tour identifiers unique', () => {
    for (const values of [LEARN_SECTIONS, LEARN_ITEMS, LEARNING_HINTS, TOUR_ITEMS]) {
      const ids = values.map(({ id }) => id)
      expect(new Set(ids).size).toBe(ids.length)
    }
    expect(LEARN_SECTIONS.map(({ id }) => id)).toEqual(LEARN_SECTION_IDS)
    expect(TOUR_ITEMS.map(({ id }) => id)).toEqual(TOUR_ITEM_IDS)
  })

  it('references real commands and gives every gesture a non-gesture alternative', () => {
    const commandIds = new Set(APP_COMMAND_MANIFEST.map(({ id }) => id))
    for (const item of [...LEARN_ITEMS, ...TOUR_ITEMS]) {
      if (item.actionCommandId) expect(commandIds.has(item.actionCommandId)).toBe(true)
    }
    for (const item of LEARN_ITEMS.filter(({ gestureInputKey }) => gestureInputKey)) {
      expect(item.alternativeKey).toBeTruthy()
    }
  })

  it('routes every contextual hint to an existing guide section', () => {
    const sections = new Set(LEARN_SECTIONS.map(({ id }) => id))
    for (const hint of LEARNING_HINTS) expect(sections.has(hint.sectionId)).toBe(true)
  })

  it('bounds persisted learning state to known unique identifiers', () => {
    expect(
      sanitizeLearningState({
        dismissedHintIds: ['workspace-pair-swipe', 'unknown', 'workspace-pair-swipe'],
        completedTourItemIds: ['tour-edit', 'unknown', 'tour-edit']
      })
    ).toEqual({
      dismissedHintIds: ['workspace-pair-swipe'],
      completedTourItemIds: ['tour-edit']
    })
  })
})

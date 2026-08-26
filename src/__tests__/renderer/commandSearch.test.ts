import { describe, expect, it } from 'vitest'
import i18n from '../../renderer/i18n'
import {
  createCommandSearchEntries,
  normalizeCommandSearchText,
  searchCommandEntries
} from '../../renderer/services/commandSearch'

describe('command search', () => {
  it('normalizes case and accents for locale-friendly matching', () => {
    expect(normalizeCommandSearchText('  RéSUMÉ  ')).toBe('resume')
  })

  it('shares manifest labels, keywords, ranking, and context availability', async () => {
    await i18n.changeLanguage('en')
    const entries = createCommandSearchEntries(i18n.t, {
      document: false,
      pdf: false,
      project: false
    })

    expect(searchCommandEntries(entries, 'release').map((entry) => entry.command.id)).toEqual([
      'app.checkUpdates'
    ])
    expect(searchCommandEntries(entries, '> open').at(0)?.command.id).toBe('file.open')
    expect(entries.find((entry) => entry.command.id === 'file.save')).toMatchObject({
      enabled: false,
      unavailableLabel: 'Open a document first'
    })
  })
})

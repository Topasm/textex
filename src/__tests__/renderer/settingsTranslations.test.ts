import { describe, expect, it } from 'vitest'
import de from '../../renderer/i18n/locales/de.json'
import en from '../../renderer/i18n/locales/en.json'
import es from '../../renderer/i18n/locales/es.json'
import fr from '../../renderer/i18n/locales/fr.json'
import ko from '../../renderer/i18n/locales/ko.json'
import pt from '../../renderer/i18n/locales/pt.json'
import zh from '../../renderer/i18n/locales/zh.json'

function leafKeys(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return child && typeof child === 'object' && !Array.isArray(child)
      ? leafKeys(child as object, path)
      : [path]
  })
}

describe('settings translations', () => {
  it.each([
    ['de', de.settings],
    ['es', es.settings],
    ['fr', fr.settings],
    ['ko', ko.settings],
    ['pt', pt.settings],
    ['zh', zh.settings]
  ])('%s has the same settings keys as English', (_locale, settings) => {
    expect(leafKeys(settings).sort()).toEqual(leafKeys(en.settings).sort())
  })
})

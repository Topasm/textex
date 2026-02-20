import { describe, it, expect } from 'vitest'
import en from '../../renderer/i18n/locales/en.json'
import es from '../../renderer/i18n/locales/es.json'
import zh from '../../renderer/i18n/locales/zh.json'
import fr from '../../renderer/i18n/locales/fr.json'
import de from '../../renderer/i18n/locales/de.json'
import pt from '../../renderer/i18n/locales/pt.json'
import ko from '../../renderer/i18n/locales/ko.json'

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...flattenKeys(value as Record<string, unknown>, fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys
}

function flattenValues(obj: Record<string, unknown>, prefix = ''): Map<string, string> {
  const map = new Map<string, string>()
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      for (const [k, v] of flattenValues(value as Record<string, unknown>, fullKey)) {
        map.set(k, v)
      }
    } else if (typeof value === 'string') {
      map.set(fullKey, value)
    }
  }
  return map
}

const enKeys = flattenKeys(en)
const enValues = flattenValues(en)

const locales: Record<string, Record<string, unknown>> = { es, zh, fr, de, pt, ko }

describe('English translations', () => {
  it('should have at least 200 keys', () => {
    expect(enKeys.length).toBeGreaterThanOrEqual(200)
  })

  it('should not have empty string values', () => {
    const emptyKeys: string[] = []
    for (const [key, value] of enValues) {
      if (value.trim() === '') {
        emptyKeys.push(key)
      }
    }
    expect(emptyKeys).toEqual([])
  })
})

describe.each(Object.entries(locales))('%s translations', (lang, locale) => {
  const localeKeys = flattenKeys(locale)

  it('should have no empty string values', () => {
    const values = flattenValues(locale)
    const emptyKeys: string[] = []
    for (const [key, value] of values) {
      if (value.trim() === '') {
        emptyKeys.push(key)
      }
    }
    expect(emptyKeys).toEqual([])
  })

  it('should warn about missing keys vs English', () => {
    const missing = enKeys.filter((k) => !localeKeys.includes(k))
    if (missing.length > 0) {
      console.warn(
        `[${lang}] Missing ${missing.length} keys: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '...' : ''}`
      )
    }
    // Allow up to 10% missing — fallback to English covers these
    const threshold = Math.floor(enKeys.length * 0.1)
    expect(missing.length).toBeLessThanOrEqual(threshold)
  })

  it('should preserve interpolation placeholders', () => {
    const localeValues = flattenValues(locale)
    const mismatches: string[] = []

    for (const [key, enValue] of enValues) {
      const localeValue = localeValues.get(key)
      if (!localeValue) continue

      // Extract {{...}} placeholders from English
      const enPlaceholders = (enValue.match(/\{\{[^}]+\}\}/g) ?? []).sort()
      const localePlaceholders = (localeValue.match(/\{\{[^}]+\}\}/g) ?? []).sort()

      if (JSON.stringify(enPlaceholders) !== JSON.stringify(localePlaceholders)) {
        mismatches.push(
          `${key}: expected ${enPlaceholders.join(',')} got ${localePlaceholders.join(',')}`
        )
      }
    }

    expect(mismatches).toEqual([])
  })
})

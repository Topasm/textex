import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { useSettingsStore } from '../store/useSettingsStore'

import en from './locales/en.json'

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'zh', label: '中文' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Português' },
  { code: 'ko', label: '한국어' }
] as const

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]['code']

/**
 * Only English ships in the initial bundle.
 *
 * Every locale carries the full key set, so bundling all seven put six unused
 * translations — the majority of them — in front of first paint. Each other
 * language is a separate chunk fetched when it is actually selected, with
 * English remaining the eager fallback so a slow or failed fetch renders
 * readable text instead of raw keys.
 */
const LOCALE_LOADERS: Record<
  Exclude<SupportedLanguage, 'en'>,
  () => Promise<{ default: object }>
> = {
  es: () => import('./locales/es.json'),
  zh: () => import('./locales/zh.json'),
  fr: () => import('./locales/fr.json'),
  de: () => import('./locales/de.json'),
  pt: () => import('./locales/pt.json'),
  ko: () => import('./locales/ko.json')
}

function isLazyLanguage(language: string): language is keyof typeof LOCALE_LOADERS {
  return language in LOCALE_LOADERS
}

const loaded = new Set<string>(['en'])

/** Resolves once the language's bundle is in place, so callers can await it. */
export async function loadLanguage(language: string): Promise<void> {
  if (loaded.has(language) || !isLazyLanguage(language)) return
  try {
    const resources = await LOCALE_LOADERS[language]()
    i18n.addResourceBundle(language, 'translation', resources.default, true, true)
    loaded.add(language)
  } catch (error) {
    // English stays active; a missing chunk must not blank the UI.
    console.error('[i18n:loadLanguage]', language, error)
  }
}

const initialLanguage = useSettingsStore.getState().settings.language || 'en'

i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: initialLanguage,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false
  }
})

/** Awaited during bootstrap so the first paint is already translated. */
export const initialLanguageReady = loadLanguage(initialLanguage)

// Subscribe to language setting changes and sync i18n + document lang
useSettingsStore.subscribe(
  (state) => state.settings.language,
  (language) => {
    const lang = language || 'en'
    if (i18n.language !== lang) {
      void loadLanguage(lang).then(() => i18n.changeLanguage(lang))
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang
    }
  }
)

// Set initial document lang
if (typeof document !== 'undefined') {
  document.documentElement.lang = initialLanguage
}

export default i18n

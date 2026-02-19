import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { useSettingsStore } from '../store/useSettingsStore'

import en from './locales/en.json'
import es from './locales/es.json'
import zh from './locales/zh.json'
import fr from './locales/fr.json'
import de from './locales/de.json'
import pt from './locales/pt.json'
import ko from './locales/ko.json'

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'zh', label: '中文' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Português' },
  { code: 'ko', label: '한국어' }
] as const

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
    zh: { translation: zh },
    fr: { translation: fr },
    de: { translation: de },
    pt: { translation: pt },
    ko: { translation: ko }
  },
  lng: useSettingsStore.getState().settings.language || 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false
  }
})

// Subscribe to language setting changes and sync i18n + document lang
useSettingsStore.subscribe(
  (state) => state.settings.language,
  (language) => {
    const lang = language || 'en'
    if (i18n.language !== lang) {
      i18n.changeLanguage(lang)
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang
    }
  }
)

// Set initial document lang
if (typeof document !== 'undefined') {
  document.documentElement.lang = useSettingsStore.getState().settings.language || 'en'
}

export default i18n

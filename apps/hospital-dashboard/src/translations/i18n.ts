import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { ApiError, type LocalizedText } from '../lib/api.ts'
import ar from './ar.json'
import en from './en.json'

export type Language = 'en' | 'ar'

const LANGUAGE_KEY = 'wasla.language'

/** The staff website opens in English unless this browser chose Arabic before. */
function storedLanguage(): Language {
  try {
    return localStorage.getItem(LANGUAGE_KEY) === 'ar' ? 'ar' : 'en'
  } catch {
    return 'en'
  }
}

/** Sets <html lang dir> so the whole page, scrollbars included, flips for Arabic. */
function applyToDocument(lang: Language): void {
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: storedLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  initAsync: false,
})
applyToDocument(i18n.language as Language)

export function currentLanguage(): Language {
  return i18n.language === 'ar' ? 'ar' : 'en'
}

export async function setLanguage(lang: Language): Promise<void> {
  try {
    localStorage.setItem(LANGUAGE_KEY, lang)
  } catch {
    // Not remembered when storage is blocked; the switch still works.
  }
  await i18n.changeLanguage(lang)
  applyToDocument(lang)
}

/** Picks the right side of a `{ ar, en }` object from the API. */
export function localized(text: LocalizedText, lang: Language = currentLanguage()): string {
  return lang === 'ar' ? text.ar : text.en
}

/** Turns any thrown value into a message staff can act on. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return i18n.t('errors.NETWORK')
    const key = `errors.${error.code}`
    return i18n.exists(key) ? i18n.t(key) : i18n.t('errors.INTERNAL')
  }
  return i18n.t('errors.INTERNAL')
}

export default i18n

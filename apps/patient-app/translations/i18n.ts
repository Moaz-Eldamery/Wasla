import i18n from 'i18next';
import { useEffect, useState } from 'react';
import { I18nManager } from 'react-native';
import type { ErrorCode, LocalizedText } from '../lib/api';
import ar from './ar.json';
import en from './en.json';

export type AppLanguage = 'en' | 'ar';

const resources = {
  en: { translation: en },
  ar: { translation: ar },
} as const;

let currentLang: AppLanguage = 'en';
const languageListeners = new Set<(lang: AppLanguage) => void>();

function ensureI18n(): void {
  if (!i18n.isInitialized) {
    void i18n.init({
      compatibilityJSON: 'v4',
      resources,
      lng: currentLang,
      fallbackLng: 'en',
      initAsync: false,
      interpolation: {
        escapeValue: false,
      },
    });
  }
}

export function translate(
  key: string,
  params?: Record<string, string | number>,
  lang: AppLanguage = currentLang,
): string {
  ensureI18n();
  return String(i18n.t(key, { ...params, lng: lang }));
}

export function useTranslation() {
  const [lang, setLang] = useState<AppLanguage>(currentLang);

  useEffect(() => {
    return subscribeLanguage(setLang);
  }, []);

  return {
    t: (key: string, params?: Record<string, string | number>) => translate(key, params, lang),
    i18n,
  };
}

export function getAppLanguage(): AppLanguage {
  ensureI18n();
  return currentLang;
}

export function isRtlLanguage(lang: AppLanguage = currentLang): boolean {
  return lang === 'ar';
}

export async function setAppLanguage(lang: AppLanguage): Promise<void> {
  ensureI18n();
  currentLang = lang;
  const rtl = lang === 'ar';
  try {
    I18nManager.allowRTL(true);
    I18nManager.forceRTL(rtl);
  } catch {
    // Ignore in environments where I18nManager is mocked or read-only
  }
  await i18n.changeLanguage(lang);
  for (const listener of languageListeners) {
    listener(lang);
  }
}

export async function toggleAppLanguage(): Promise<AppLanguage> {
  const next: AppLanguage = currentLang === 'en' ? 'ar' : 'en';
  await setAppLanguage(next);
  return next;
}

export function subscribeLanguage(listener: (lang: AppLanguage) => void): () => void {
  languageListeners.add(listener);
  return () => {
    languageListeners.delete(listener);
  };
}

/** Picks the right language from a `{ ar, en }` object returned by the backend. */
export function pickLocalized(text: LocalizedText, lang: AppLanguage = currentLang): string {
  return lang === 'ar' ? text.ar : text.en;
}

/** Formats a UTC ISO timestamp in Africa/Cairo time for the active language. */
export function formatCairoDateTime(
  isoString: string,
  lang: AppLanguage = currentLang,
): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }
  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** Returns the YYYY-MM-DD calendar day in Africa/Cairo for grouping slots. */
export function getCairoDayKey(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString.slice(0, 10);
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Formats a short day label (e.g. "Sat, Nov 7") in Africa/Cairo time. */
export function formatCairoShortDay(
  isoString: string,
  lang: AppLanguage = currentLang,
): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }
  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'Africa/Cairo',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/** Formats only the time of day (e.g. "10:00 AM") in Africa/Cairo time. */
export function formatCairoTime(isoString: string, lang: AppLanguage = currentLang): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }
  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'Africa/Cairo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** Translates a contract ErrorCode into localized user-facing text. */
export function translateErrorCode(code: ErrorCode | string): string {
  ensureI18n();
  const key = `errors.${code}`;
  if (i18n.exists(key)) {
    return String(i18n.t(key, { lng: currentLang }));
  }
  return String(i18n.t('errors.INTERNAL', { lng: currentLang }));
}

export default i18n;



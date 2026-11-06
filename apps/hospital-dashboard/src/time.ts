import type { Language } from './translations/i18n.ts'

/** Every time on the website is shown in the hospital's time zone, whatever the computer's. */
export const HOSPITAL_TIME_ZONE = 'Africa/Cairo'

/** How often panels ask the server again, until live updates (KAN-27) exist. */
export const REFRESH_MS = 15_000

function parts(date: Date): Record<'year' | 'month' | 'day' | 'hour' | 'minute', number> {
  const out = { year: 0, month: 0, day: 0, hour: 0, minute: 0 }
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: HOSPITAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  for (const p of fmt.formatToParts(date)) {
    if (p.type in out) out[p.type as keyof typeof out] = Number(p.value)
  }
  return out
}

/** The Cairo calendar day of `date` as `YYYY-MM-DD`, the format the API's `date` parameters take. */
export function cairoDate(date: Date = new Date()): string {
  const p = parts(date)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** Minutes since Cairo midnight, used to place things on the day book. */
export function cairoMinutes(date: Date | string): number {
  const p = parts(typeof date === 'string' ? new Date(date) : date)
  return p.hour * 60 + p.minute
}

/** The Cairo hour (0–23) of a timestamp. */
export function cairoHour(date: Date | string): number {
  return parts(typeof date === 'string' ? new Date(date) : date).hour
}

/** 24-hour clock time, e.g. "09:30" (with Arabic-Indic digits in Arabic). */
export function formatTime(date: Date | string, lang: Language): string {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', {
    timeZone: HOSPITAL_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(typeof date === 'string' ? new Date(date) : date)
}

/** An hour label for the day book, e.g. "09:00". */
export function formatHour(hour: number, lang: Language): string {
  const label = `${String(hour).padStart(2, '0')}:00`
  return lang === 'ar' ? label.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]) : label
}

/** The day in words for the top bar, e.g. "Thursday 6 November 2026". */
export function formatDay(date: Date, lang: Language): string {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', {
    timeZone: HOSPITAL_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

import type { Statistics } from '../../lib/api.ts'
import i18n, { type Language } from '../../translations/i18n.ts'

/**
 * Department colours for the stacked visits chart, in the fixed department
 * order the API gives (never by rank, so a department keeps its colour when a
 * filter changes). Six categorical slots validated for adjacent marks on the
 * white panel (dataviz validator: CVD ΔE ≥ 9.1, normal-vision ΔE ≥ 19.6); three
 * sit under 3:1 contrast, so the chart always has a legend and a table view.
 */
export const SERIES_COLORS = ['#2A78D6', '#EB6834', '#1BAF7A', '#EDA100', '#E87BA4', '#008300'] as const
/** A seventh department onwards folds into "Other", in de-emphasis grey. */
export const OTHER_COLOR = '#94A3B8'
/** The wait and no-show lines wear the brand blue. */
export const SINGLE_COLOR = '#0B5CAB'

/** The longest range the API accepts, in days. */
export const MAX_RANGE_DAYS = 92

/** `YYYY-MM-DD` plus `days` (negative to go back), on the calendar alone. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Whole days from `from` to `to`, counting both ends. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
}

/** The last `days` days ending today (Cairo). */
export function lastDays(today: string, days: number): { from: string; to: string } {
  return { from: addDays(today, -(days - 1)), to: today }
}

/** Round axis ticks from 0 to just above `max`: about four steps of 1, 2, 2.5 or 5 × a power of ten. */
export function niceTicks(max: number, target = 4): number[] {
  if (!(max > 0)) return [0, 1]
  const rough = max / target
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? 10 * magnitude
  const top = Math.ceil(max / step - 1e-9) * step
  const ticks: number[] = []
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Number(v.toPrecision(12)))
  return ticks
}

export interface Series {
  key: string
  label: string
  color: string
  /** One value per day; null means "not available" for that day. */
  values: (number | null)[]
}

/**
 * Visits per day as stacked series, one per department. Colours come from
 * `order`, every clinical department in the fixed API order, so a department
 * keeps its colour whatever the filter; past the sixth they sum into "Other".
 * A day without data is null in every series.
 */
export function visitSeries(stats: Statistics, lang: Language, otherLabel: string, order: string[] = stats.departments.map((d) => d.id)): Series[] {
  const slot = (id: string) => {
    const i = order.indexOf(id)
    return i >= 0 && i < SERIES_COLORS.length ? i : -1
  }
  const named = stats.departments.filter((d) => slot(d.id) >= 0)
  const rest = new Set(stats.departments.filter((d) => slot(d.id) < 0).map((d) => d.id))
  const series: Series[] = named.map((d) => ({
    key: d.id,
    label: lang === 'ar' ? d.name.ar : d.name.en,
    color: SERIES_COLORS[slot(d.id)],
    values: stats.days.map((day) => (day.visits ? (day.visits.find((v) => v.departmentId === d.id)?.count ?? 0) : null)),
  }))
  if (rest.size) {
    const only = rest.size === 1 && named.length === 0 ? stats.departments.find((d) => rest.has(d.id)) : undefined
    series.push({
      key: only?.id ?? 'other',
      label: only ? (lang === 'ar' ? only.name.ar : only.name.en) : otherLabel,
      color: OTHER_COLOR,
      values: stats.days.map((day) => (day.visits ? day.visits.filter((v) => rest.has(v.departmentId)).reduce((sum, v) => sum + v.count, 0) : null)),
    })
  }
  return series
}

/** A day on the chart's axis: "Sat 31" for short ranges, "31 Oct" for long ones. */
export function formatAxisDay(date: string, lang: Language, long: boolean): string {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', {
    timeZone: 'UTC',
    ...(long ? { day: 'numeric', month: 'short' } : { weekday: 'short', day: 'numeric' }),
  }).format(new Date(`${date}T00:00:00Z`))
}

/** A day in full for tooltips and tables, e.g. "Saturday 31 October 2026". */
export function formatFullDay(date: string, lang: Language): string {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00Z`))
}

export function formatCount(value: number, lang: Language): string {
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-GB').format(value)
}

/** Minutes to the nearest whole minute, written the way the rest of the website writes them ("25 min"). */
export function formatMinutes(value: number, lang: Language): string {
  return i18n.t('stats.minutes', { value: formatCount(Math.round(value), lang), lng: lang })
}

/** A 0–1 rate as a percentage with one decimal, e.g. 7.9%. */
export function formatRate(value: number, lang: Language): string {
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)
}

import type { Appointment } from '../lib/api.ts'
import { cairoHour, cairoMinutes } from '../time.ts'

/** The day book always shows at least the clinic's usual hours. */
const DAY_START_HOUR = 8
const DAY_END_HOUR = 16
/** A booked patient this many minutes past their time shows as late. */
export const LATE_AFTER_MINUTES = 10

/** One line of the day book, top to bottom. */
export type DayEntry =
  | { kind: 'hour'; hour: number; empty: boolean }
  | { kind: 'appointment'; appointment: Appointment }
  | { kind: 'now'; betweenHours: boolean }

/**
 * Lays the day out as a timetable: an entry per hour (empty hours kept, so
 * the day keeps its shape), each appointment under the hour it starts in,
 * and, when `nowMinutes` is given, one "now" entry just before the first
 * thing that starts after it.
 */
export function layoutDay(appointments: Appointment[], nowMinutes: number | null): DayEntry[] {
  const sorted = [...appointments].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const hours = sorted.map((a) => cairoHour(a.startsAt))
  const first = Math.min(DAY_START_HOUR, ...hours)
  const last = Math.max(DAY_END_HOUR - 1, ...hours)

  const entries: DayEntry[] = []
  let nowPlaced = nowMinutes === null
  for (let hour = first; hour <= last; hour++) {
    if (!nowPlaced && hour * 60 > nowMinutes!) {
      entries.push({ kind: 'now', betweenHours: true })
      nowPlaced = true
    }
    const inHour = sorted.filter((a) => cairoHour(a.startsAt) === hour)
    entries.push({ kind: 'hour', hour, empty: inHour.length === 0 })
    for (const appointment of inHour) {
      if (!nowPlaced && cairoMinutes(appointment.startsAt) > nowMinutes!) {
        entries.push({ kind: 'now', betweenHours: false })
        nowPlaced = true
      }
      entries.push({ kind: 'appointment', appointment })
    }
  }
  if (!nowPlaced) entries.push({ kind: 'now', betweenHours: true })
  return entries
}

/** Groups the flat layout back into hour bands for rendering. */
export function groupByHour(entries: DayEntry[]): { before: DayEntry[]; hour: number; empty: boolean; items: DayEntry[] }[] {
  const bands: { before: DayEntry[]; hour: number; empty: boolean; items: DayEntry[] }[] = []
  let pending: DayEntry[] = []
  for (const entry of entries) {
    if (entry.kind === 'hour') {
      bands.push({ before: pending, hour: entry.hour, empty: entry.empty, items: [] })
      pending = []
    } else if (entry.kind === 'now' && entry.betweenHours) {
      pending.push(entry)
    } else {
      bands[bands.length - 1].items.push(entry)
    }
  }
  if (pending.length && bands.length) bands[bands.length - 1].items.push(...pending)
  return bands
}

export function isLate(appointment: Appointment, now: Date): boolean {
  return (
    appointment.status === 'BOOKED' &&
    cairoMinutes(now) - cairoMinutes(appointment.startsAt) > LATE_AFTER_MINUTES
  )
}

import { describe, expect, it } from 'vitest'
import { appointment, NOW } from '../test-fixtures.ts'
import { cairoMinutes } from '../time.ts'
import { groupByHour, isLate, layoutDay } from './dayLayout.ts'

const kinds = (entries: ReturnType<typeof layoutDay>) =>
  entries.map((e) => (e.kind === 'hour' ? `h${e.hour}` : e.kind === 'now' ? 'NOW' : e.appointment.patient.name))

describe('layoutDay', () => {
  it('keeps the clinic hours 08:00–15:00 even when they are empty', () => {
    const entries = layoutDay([], null)
    expect(kinds(entries)).toEqual(['h8', 'h9', 'h10', 'h11', 'h12', 'h13', 'h14', 'h15'])
    expect(entries.every((e) => e.kind !== 'hour' || e.empty)).toBe(true)
  })

  it('puts each appointment under the hour it starts in, earliest first', () => {
    const day = [appointment('10:30', 'Mona'), appointment('09:00', 'Omar'), appointment('10:00', 'Karim')]
    expect(kinds(layoutDay(day, null))).toEqual(['h8', 'h9', 'Omar', 'h10', 'Karim', 'Mona', 'h11', 'h12', 'h13', 'h14', 'h15'])
  })

  it('stretches the day for appointments outside the usual hours', () => {
    const entries = kinds(layoutDay([appointment('07:15', 'Early'), appointment('17:45', 'Late')], null))
    expect(entries[0]).toBe('h7')
    expect(entries.slice(-2)).toEqual(['h17', 'Late'])
  })

  it('draws the now line just before the first appointment after now', () => {
    const day = [appointment('10:00', 'Karim'), appointment('10:30', 'Mona')]
    const entries = layoutDay(day, cairoMinutes(NOW)) // 10:24
    expect(kinds(entries).slice(2, 6)).toEqual(['h10', 'Karim', 'NOW', 'Mona'])
    expect(entries.find((e) => e.kind === 'now')).toEqual({ kind: 'now', betweenHours: false })
  })

  it('draws the now line between hours when nothing in this hour is still to come', () => {
    const entries = layoutDay([appointment('09:00', 'Omar')], cairoMinutes(NOW))
    expect(kinds(entries).slice(0, 5)).toEqual(['h8', 'h9', 'Omar', 'h10', 'NOW'])
    expect(entries.filter((e) => e.kind === 'now')).toHaveLength(1)
  })

  it('draws the now line at the end after the last hour', () => {
    const entries = layoutDay([], 22 * 60)
    expect(kinds(entries).at(-1)).toBe('NOW')
  })

  it('draws no now line when the day shown is not today', () => {
    expect(layoutDay([appointment('10:30', 'Mona')], null).some((e) => e.kind === 'now')).toBe(false)
  })
})

describe('groupByHour', () => {
  it('attaches a between-hours now line before its hour band', () => {
    const bands = groupByHour(layoutDay([], 9 * 60 + 30))
    const ten = bands.find((b) => b.hour === 10)!
    expect(ten.before).toEqual([{ kind: 'now', betweenHours: true }])
    expect(bands.flatMap((b) => [...b.before, ...b.items]).filter((e) => e.kind === 'now')).toHaveLength(1)
  })
})

describe('isLate', () => {
  it('marks a booked patient more than 10 minutes past their time', () => {
    expect(isLate(appointment('10:00', 'Karim'), NOW)).toBe(true)
    expect(isLate(appointment('10:15', 'Hoda'), NOW)).toBe(false)
  })

  it('never marks a patient who has already checked in', () => {
    expect(isLate(appointment('09:00', 'Omar', 'CHECKED_IN'), NOW)).toBe(false)
  })
})

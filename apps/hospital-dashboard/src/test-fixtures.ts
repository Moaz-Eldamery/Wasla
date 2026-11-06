import { vi } from 'vitest'
import type { Appointment, AppointmentStatus, Clinic, QueueBoard, User } from './lib/api.ts'

/** Friday 6 Nov 2026, 10:24 in Cairo (UTC+2). */
export const NOW = new Date('2026-11-06T08:24:00Z')

export const clinic: Clinic = {
  id: 'clinic-3',
  departmentId: 'cardiology',
  name: { en: 'Cardiology · Clinic 3', ar: 'القلب · عيادة ٣' },
  building: 'B',
  floor: '2',
  directions: { en: 'Left after the lifts', ar: 'يسارًا بعد المصاعد' },
}

export const receptionist: User = {
  id: 'staff-1',
  type: 'STAFF',
  name: 'Nadia Hassan',
  phone: '+201000000010',
  roles: ['RECEPTIONIST'],
}

let n = 0
/** A fake appointment starting at `cairoTime` (HH:MM) on the test day. */
export function appointment(cairoTime: string, patient: string, status: AppointmentStatus = 'BOOKED'): Appointment {
  const [h, m] = cairoTime.split(':').map(Number)
  const start = new Date(Date.UTC(2026, 10, 6, h - 2, m))
  n += 1
  return {
    id: `appt-${n}`,
    status,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 15 * 60_000).toISOString(),
    patient: { id: `patient-${n}`, name: patient },
    doctor: { id: 'doctor-1', name: 'Dr. Rania Mostafa' },
    clinic,
    bookedAt: '2026-11-01T09:00:00Z',
  }
}

export const emptyQueue: QueueBoard = { clinicId: clinic.id, waiting: [], inConsultation: [] }

type Handler = (url: URL, init: RequestInit) => { status?: number; body?: unknown } | undefined

/**
 * Replaces fetch with a tiny fake gateway. `routes` maps "METHOD /path" to a
 * handler; anything unmatched answers 404. Returns the list of calls made.
 */
export function fakeGateway(routes: Record<string, Handler>) {
  const calls: { method: string; path: string; init: RequestInit }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = new URL(input, 'http://localhost')
      const method = init.method ?? 'GET'
      const path = url.pathname.replace(/^\/api/, '')
      calls.push({ method, path, init })
      const handler = routes[`${method} ${path}`]
      const result = handler?.(url, init) ?? { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Not found' } } }
      const status = result.status ?? 200
      return new Response(status === 204 ? null : JSON.stringify(result.body ?? {}), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    }),
  )
  return calls
}

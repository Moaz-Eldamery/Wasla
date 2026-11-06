import { vi } from 'vitest'
import type { AdminDepartment, Appointment, AppointmentStatus, AuditEntry, Clinic, QueueBoard, StaffMember, Statistics, User } from './lib/api.ts'

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

// ------------------------------------------------------------------ admin

export const adminUser: User = { id: 'admin-1', type: 'STAFF', name: 'Demo Admin', phone: '+201000000001', roles: ['ADMIN'] }

export const staffList: StaffMember[] = [
  { id: 'admin-1', name: 'Demo Admin', phone: '+201000000001', roles: ['ADMIN'], active: true, createdAt: '2026-10-01T08:00:00Z' },
  { id: 'doc-1', name: 'Dr. Rania Mostafa', phone: '+201000000011', roles: ['DOCTOR'], active: true, createdAt: '2026-10-01T08:00:00Z' },
  { id: 'doc-2', name: 'Dr. Omar Nabil', phone: '+201000000014', roles: ['DOCTOR'], active: false, createdAt: '2026-10-02T08:00:00Z' },
  { id: 'rec-1', name: 'Nadia Hassan', phone: '+201000000021', roles: ['RECEPTIONIST'], active: true, createdAt: '2026-10-03T08:00:00Z' },
  { id: 'lab-1', name: 'Mona Farouk', phone: '+201000000031', roles: ['LAB'], active: true, createdAt: '2026-10-04T08:00:00Z' },
]

export function adminDepartments(): AdminDepartment[] {
  return [
    {
      id: 'dep-im',
      kind: 'CLINICAL',
      name: { en: 'Internal Medicine', ar: 'الباطنة' },
      active: true,
      clinics: [
        {
          id: 'cl-im1',
          departmentId: 'dep-im',
          name: { en: 'Internal Medicine Clinic 1', ar: 'عيادة الباطنة ١' },
          building: 'A',
          floor: '1',
          directions: { en: 'First floor, left of the lift', ar: 'الدور الأول، يسار المصعد' },
          active: true,
          staff: [
            { id: 'doc-1', name: 'Dr. Rania Mostafa', roles: ['DOCTOR'], active: true },
            { id: 'rec-1', name: 'Nadia Hassan', roles: ['RECEPTIONIST'], active: true },
          ],
        },
      ],
    },
    {
      id: 'dep-derm',
      kind: 'CLINICAL',
      name: { en: 'Dermatology', ar: 'الجلدية' },
      active: false,
      clinics: [
        {
          id: 'cl-derm',
          departmentId: 'dep-derm',
          name: { en: 'Dermatology Clinic', ar: 'عيادة الجلدية' },
          building: 'B',
          floor: '3',
          directions: { en: 'Building B, third floor', ar: 'المبنى ب، الدور الثالث' },
          active: true,
          staff: [],
        },
      ],
    },
    { id: 'dep-lab', kind: 'LAB', name: { en: 'Laboratory', ar: 'المعمل' }, active: true, clinics: [] },
  ]
}

/** Seven days ending on the test day; the test day itself has no data yet. */
export function statistics(): Statistics {
  const day = (date: string, im: number | null, derm: number, wait: number | null, rate: number | null) => ({
    date,
    visits: im === null ? null : [{ departmentId: 'dep-im', count: im }, { departmentId: 'dep-derm', count: derm }],
    averageWaitMinutes: wait,
    noShowRate: rate,
  })
  return {
    from: '2026-10-31',
    to: '2026-11-06',
    departmentId: null,
    departments: [
      { id: 'dep-im', name: { en: 'Internal Medicine', ar: 'الباطنة' } },
      { id: 'dep-derm', name: { en: 'Dermatology', ar: 'الجلدية' } },
    ],
    days: [
      day('2026-10-31', 41, 27, 23.4, 0.081),
      day('2026-11-01', 46, 25, 27.9, 0.094),
      day('2026-11-02', 44, 28, 25.1, 0.072),
      day('2026-11-03', 39, 24, 21.6, 0.066),
      day('2026-11-04', 48, 26, 31.2, 0.103),
      day('2026-11-05', 37, 22, 19.8, 0.058),
      day('2026-11-06', null, 0, null, null),
    ],
    totals: { visits: 407, averageWaitMinutes: 24.9, noShowRate: 0.079 },
  }
}

export function auditEntry(id: string, overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id,
    occurredAt: '2026-11-06T08:21:14Z',
    actor: { id: 'admin-1', name: 'Demo Admin', type: 'STAFF' },
    action: 'STAFF_ROLES_CHANGED',
    outcome: 'SUCCESS',
    entityType: 'ACCOUNT',
    entityId: '6f1c2a10-1d1e-4c3a-9a51-0a0000000011',
    ip: '10.0.4.12',
    ...overrides,
  }
}

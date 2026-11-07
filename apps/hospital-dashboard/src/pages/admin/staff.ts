import type { StaffRole } from '../../lib/api.ts'

/** Every staff role, in the order the screens list them. */
export const ALL_ROLES: StaffRole[] = ['RECEPTIONIST', 'DOCTOR', 'LAB', 'ADMIN']

/** Roles that work inside clinics, so they can be assigned to one. Admin alone can't. */
export const CLINIC_ROLES: StaffRole[] = ['RECEPTIONIST', 'DOCTOR', 'LAB']

/** Query keys for the staff list, so every screen that changes staff can refresh it. */
export const staffKeys = {
  all: ['staff'] as const,
  list: (q: string, status: string) => ['staff', q, status] as const,
}

/** A plausible email address (the server checks it properly). */
export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254
}

/**
 * Accepts an Egyptian mobile number as staff tend to type it (`010 1234 5678`,
 * `01012345678`, `+20 10…`) and returns it in E.164 (`+201012345678`), or null.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[\s\-()]/g, '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
  const e164 = /^01\d{9}$/.test(digits) ? `+2${digits}` : /^0020\d{10}$/.test(digits) ? `+${digits.slice(2)}` : digits
  return /^\+201\d{9}$/.test(e164) ? e164 : null
}

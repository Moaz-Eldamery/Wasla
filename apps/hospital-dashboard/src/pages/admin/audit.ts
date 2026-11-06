import type { AuditAction } from '../../lib/api.ts'

/** The action filter's groups, in the order a visit and an admin's work happen. */
export const AUDIT_ACTION_GROUPS: { group: string; actions: AuditAction[] }[] = [
  { group: 'access', actions: ['LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'PATIENT_REGISTERED', 'ACCESS_DENIED'] },
  { group: 'visits', actions: ['APPOINTMENT_BOOKED', 'APPOINTMENT_CANCELLED', 'CHECK_IN', 'VISIT_STARTED', 'VISIT_COMPLETED'] },
  { group: 'records', actions: ['NOTES_VIEWED', 'NOTES_SAVED', 'TEST_ORDERED', 'RESULT_UPLOADED', 'RESULT_RELEASED', 'RESULT_VIEWED'] },
  { group: 'admin', actions: ['STAFF_CREATED', 'STAFF_ROLES_CHANGED', 'STAFF_DEACTIVATED', 'STAFF_REACTIVATED', 'DEPARTMENT_CHANGED', 'CLINIC_CHANGED', 'CLINIC_STAFF_CHANGED'] },
]

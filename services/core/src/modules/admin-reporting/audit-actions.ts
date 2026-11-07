// The audit log stores dotted action names as the services write them
// (`auth.login`, `appointment.check_in`, ...). The admin screen shows a fixed
// list instead (the contract's `AuditAction`). This file is the one place that
// maps between the two. A new dotted name shows as OTHER until it is added here.
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuditOutcome } from '../../generated/prisma/enums.js';

export const AUDIT_ACTIONS = [
  'LOGIN',
  'LOGIN_FAILED',
  'LOGOUT',
  'PATIENT_REGISTERED',
  'PHONE_VERIFIED',
  'ACCESS_DENIED',
  'APPOINTMENT_BOOKED',
  'APPOINTMENT_CANCELLED',
  'CHECK_IN',
  'VISIT_STARTED',
  'VISIT_COMPLETED',
  'RECORD_VIEWED',
  'NOTES_VIEWED',
  'NOTES_SAVED',
  'TEST_ORDERED',
  'TEST_STARTED',
  'RESULT_UPLOADED',
  'RESULT_RELEASED',
  'RESULT_VIEWED',
  'STAFF_CREATED',
  'STAFF_ROLES_CHANGED',
  'STAFF_DEACTIVATED',
  'STAFF_REACTIVATED',
  'DEPARTMENT_CHANGED',
  'CLINIC_CHANGED',
  'CLINIC_STAFF_CHANGED',
  'OTHER',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

type Known = Exclude<AuditAction, 'OTHER'>;

/** The dotted names behind each action, and the outcomes, when only some count. */
const SOURCES: Record<Known, { names: string[]; outcomes?: AuditOutcome[] }> = {
  LOGIN: { names: ['auth.login'], outcomes: ['SUCCESS'] },
  LOGIN_FAILED: { names: ['auth.login'], outcomes: ['FAILED', 'DENIED'] },
  LOGOUT: { names: ['auth.logout'] },
  PATIENT_REGISTERED: { names: ['auth.register'] },
  PHONE_VERIFIED: { names: ['auth.verify_phone'] },
  ACCESS_DENIED: { names: ['access.forbidden'] },
  APPOINTMENT_BOOKED: { names: ['appointment.book'] },
  APPOINTMENT_CANCELLED: { names: ['appointment.cancel'] },
  CHECK_IN: { names: ['appointment.check_in'] },
  VISIT_STARTED: { names: ['appointment.call_in', 'queue.call_next'] },
  VISIT_COMPLETED: { names: ['appointment.complete'] },
  RECORD_VIEWED: {
    names: [
      'appointment.read',
      'clinic.appointments.read',
      'journey.read',
      'queue.read',
      'queue.position.read',
      'test.read',
      'test.lab_list',
    ],
  },
  NOTES_VIEWED: { names: ['notes.read', 'notes.versions', 'notes.summary'] },
  NOTES_SAVED: { names: ['notes.save'] },
  TEST_ORDERED: { names: ['test.order'] },
  TEST_STARTED: { names: ['test.start'] },
  RESULT_UPLOADED: { names: ['result.upload'] },
  RESULT_RELEASED: { names: ['result.release'] },
  RESULT_VIEWED: { names: ['result.read', 'result.download'] },
  STAFF_CREATED: { names: ['staff.create'] },
  STAFF_ROLES_CHANGED: { names: ['staff.roles'] },
  STAFF_DEACTIVATED: { names: ['staff.deactivate'] },
  STAFF_REACTIVATED: { names: ['staff.reactivate'] },
  DEPARTMENT_CHANGED: {
    names: ['department.create', 'department.update', 'department.deactivate', 'department.reactivate'],
  },
  CLINIC_CHANGED: {
    names: ['clinic.create', 'clinic.update', 'clinic.deactivate', 'clinic.reactivate'],
  },
  CLINIC_STAFF_CHANGED: { names: ['clinic.staff.assign', 'clinic.staff.unassign'] },
};

const ALL_NAMES = [...new Set(Object.values(SOURCES).flatMap((s) => s.names))];

/** The screen's action for a stored entry. */
export function toAuditAction(name: string, outcome: AuditOutcome): AuditAction {
  for (const [action, source] of Object.entries(SOURCES) as [Known, (typeof SOURCES)[Known]][]) {
    if (source.names.includes(name) && (!source.outcomes || source.outcomes.includes(outcome))) {
      return action;
    }
  }
  return 'OTHER';
}

/** The stored entries that show as `action`, for the log's action filter. */
export function auditActionWhere(action: AuditAction): Prisma.AuditLogWhereInput {
  if (action === 'OTHER') return { action: { notIn: ALL_NAMES } };
  const { names, outcomes } = SOURCES[action];
  return { action: { in: names }, ...(outcomes && { outcome: { in: outcomes } }) };
}

export const AUDIT_ENTITY_TYPES = ['ACCOUNT', 'APPOINTMENT', 'SLOT', 'TEST_ORDER', 'DEPARTMENT', 'CLINIC'] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

/** The stored entity type (`test_order`) as the contract writes it (`TEST_ORDER`), or null. */
export function toAuditEntityType(stored: string | null): AuditEntityType | null {
  const upper = stored?.toUpperCase();
  return (AUDIT_ENTITY_TYPES as readonly string[]).includes(upper ?? '') ? (upper as AuditEntityType) : null;
}

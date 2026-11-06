// What the booking endpoints return (the response schemas in
// contracts/openapi.yaml), and the Prisma selects that load exactly that.
// Accounts are always reached with a `select` of allowed columns only.
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  AppointmentStatus,
  DepartmentKind,
} from '../../generated/prisma/enums.js';
import {
  clinicSelect,
  toClinicView,
  type ClinicView,
  type LocalizedText,
} from '../../shared/clinic.views.js';

export interface DepartmentView {
  id: string;
  kind: DepartmentKind;
  name: LocalizedText;
  clinics: ClinicView[];
}

export interface DoctorView {
  id: string;
  name: string;
  clinics: ClinicView[];
}

export interface SlotView {
  id: string;
  doctorId: string;
  clinic: ClinicView;
  startsAt: Date;
  endsAt: Date;
}

/** No medical details: receptionists see exactly this. */
export interface AppointmentView {
  id: string;
  status: AppointmentStatus;
  startsAt: Date;
  endsAt: Date;
  patient: { id: string; name: string };
  doctor: { id: string; name: string };
  clinic: ClinicView;
  bookedAt: Date;
  checkedInAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

export const slotSelect = {
  id: true,
  doctorId: true,
  startsAt: true,
  endsAt: true,
  clinic: { select: clinicSelect },
} satisfies Prisma.SlotSelect;

export const appointmentSelect = {
  id: true,
  status: true,
  patientId: true,
  bookedAt: true,
  checkedInAt: true,
  startedAt: true,
  completedAt: true,
  patient: { select: { id: true, name: true } },
  slot: {
    select: {
      startsAt: true,
      endsAt: true,
      doctorId: true,
      clinicId: true,
      doctor: { select: { id: true, name: true } },
      clinic: { select: clinicSelect },
    },
  },
} satisfies Prisma.AppointmentSelect;

type SlotRow = Prisma.SlotGetPayload<{ select: typeof slotSelect }>;
export type AppointmentRow = Prisma.AppointmentGetPayload<{
  select: typeof appointmentSelect;
}>;

export function toSlotView(s: SlotRow): SlotView {
  return {
    id: s.id,
    doctorId: s.doctorId,
    clinic: toClinicView(s.clinic),
    startsAt: s.startsAt,
    endsAt: s.endsAt,
  };
}

export function toAppointmentView(a: AppointmentRow): AppointmentView {
  return {
    id: a.id,
    status: a.status,
    startsAt: a.slot.startsAt,
    endsAt: a.slot.endsAt,
    patient: a.patient,
    doctor: a.slot.doctor,
    clinic: toClinicView(a.slot.clinic),
    bookedAt: a.bookedAt,
    checkedInAt: a.checkedInAt,
    startedAt: a.startedAt,
    completedAt: a.completedAt,
  };
}

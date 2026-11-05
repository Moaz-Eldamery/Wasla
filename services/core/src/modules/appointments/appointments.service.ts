import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { DepartmentKind } from '../../generated/prisma/enums.js';
import { ApiError, notFound } from '../../shared/api-error.js';
import { AuditService } from '../../shared/audit.service.js';
import {
  addDays,
  cairoDayRange,
  cairoToday,
  daysBetween,
  startOfCairoDay,
} from '../../shared/cairo-time.js';
import { hasRole, type Caller } from '../../shared/caller.js';
import { PrismaService } from '../../shared/prisma.service.js';
import {
  appointmentSelect,
  clinicSelect,
  slotSelect,
  toAppointmentView,
  toClinicView,
  toSlotView,
  type AppointmentRow,
  type AppointmentView,
  type ClinicView,
  type DepartmentView,
  type DoctorView,
  type SlotView,
} from './appointment.views.js';

/** Default and longest window for browsing free slots, in Cairo days. */
const DEFAULT_SLOT_DAYS = 14;
const MAX_SLOT_DAYS = 31;

/** An appointment holds its slot unless it was cancelled. */
const HOLDS_SLOT = { status: { not: 'CANCELLED' } } satisfies Prisma.AppointmentWhereInput;

/** Upcoming = still booked and not over yet, or the patient is at the hospital now. */
function upcoming(now: Date): Prisma.AppointmentWhereInput {
  return {
    OR: [
      { status: { in: ['CHECKED_IN', 'IN_CONSULTATION'] } },
      { status: 'BOOKED', slot: { endsAt: { gt: now } } },
    ],
  };
}

export interface BookingResult {
  appointment: AppointmentView;
  /** False when the caller already held this slot (a retried request). */
  created: boolean;
}

/**
 * IAppointments: slots and bookings. Other modules use this service, never
 * the module's internals.
 */
@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- browsing

  async listDepartments(kind?: DepartmentKind): Promise<DepartmentView[]> {
    const rows = await this.prisma.department.findMany({
      where: { active: true, kind },
      select: {
        id: true,
        kind: true,
        nameAr: true,
        nameEn: true,
        clinics: {
          where: { active: true },
          select: clinicSelect,
          orderBy: { nameEn: 'asc' },
        },
      },
      orderBy: { nameEn: 'asc' },
    });
    return rows.map((d) => ({
      id: d.id,
      kind: d.kind,
      name: { ar: d.nameAr, en: d.nameEn },
      clinics: d.clinics.map(toClinicView),
    }));
  }

  /** Active doctors assigned to the department's active clinics. */
  async listDepartmentDoctors(departmentId: string): Promise<DoctorView[]> {
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, active: true },
      select: { id: true },
    });
    if (!department) throw notFound();

    const assignments = await this.prisma.staffClinic.findMany({
      where: {
        clinic: { departmentId, active: true },
        staff: { active: true, roles: { has: 'DOCTOR' } },
      },
      select: {
        staff: { select: { id: true, name: true } },
        clinic: { select: clinicSelect },
      },
    });

    const doctors = new Map<string, DoctorView>();
    for (const { staff, clinic } of assignments) {
      const doctor = doctors.get(staff.id) ?? { ...staff, clinics: [] };
      doctor.clinics.push(toClinicView(clinic));
      doctors.set(staff.id, doctor);
    }
    return [...doctors.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Free slots: open, in the future, in an active clinic, and not held by
   * an appointment. `from` and `to` are Cairo days, both included.
   */
  async listFreeSlots(
    doctorId: string,
    from?: string,
    to?: string,
    now: Date = new Date(),
  ): Promise<SlotView[]> {
    const firstDay = from ?? cairoToday(now);
    const lastDay = to ?? addDays(firstDay, DEFAULT_SLOT_DAYS - 1);
    const span = daysBetween(firstDay, lastDay);
    if (span < 0 || span >= MAX_SLOT_DAYS) {
      throw new ApiError(
        400,
        'VALIDATION_FAILED',
        `\`to\` must be on or after \`from\`, and at most ${MAX_SLOT_DAYS - 1} days later.`,
        [{ field: 'to', problem: 'out of range' }],
      );
    }

    const doctor = await this.prisma.account.findFirst({
      where: { id: doctorId, active: true, roles: { has: 'DOCTOR' } },
      select: { id: true },
    });
    if (!doctor) throw notFound();

    const start = startOfCairoDay(firstDay);
    const slots = await this.prisma.slot.findMany({
      where: {
        doctorId,
        status: 'OPEN',
        startsAt: {
          gte: start > now ? start : now,
          lt: startOfCairoDay(addDays(lastDay, 1)),
        },
        clinic: { active: true },
        appointments: { none: HOLDS_SLOT },
      },
      select: slotSelect,
      orderBy: { startsAt: 'asc' },
    });
    return slots.map(toSlotView);
  }

  // ---------------------------------------------------------------- booking

  /**
   * Books a slot for the calling patient. The database allows one active
   * appointment per slot, so of two simultaneous bookings exactly one wins
   * and the other gets SLOT_TAKEN. Retrying a booking the caller already
   * holds returns it again.
   */
  async book(
    caller: Caller,
    slotId: string,
    now: Date = new Date(),
  ): Promise<BookingResult> {
    const slot = await this.prisma.slot.findUnique({
      where: { id: slotId },
      select: {
        status: true,
        startsAt: true,
        clinic: { select: { active: true } },
        doctor: { select: { active: true } },
        appointments: {
          where: HOLDS_SLOT,
          select: { id: true, patientId: true },
        },
      },
    });
    if (!slot) throw notFound();

    const holder = slot.appointments[0];
    if (holder) return this.alreadyHeld(caller, slotId, holder);

    if (
      slot.status !== 'OPEN' ||
      slot.startsAt <= now ||
      !slot.clinic.active ||
      !slot.doctor.active
    ) {
      await this.recordFailedBooking(caller, slotId, 'SLOT_UNAVAILABLE');
      throw new ApiError(409, 'SLOT_UNAVAILABLE', 'This slot can no longer be booked.');
    }

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.appointment.create({
          data: { patientId: caller.id, slotId },
          select: appointmentSelect,
        });
        await this.audit.record(
          {
            caller,
            action: 'appointment.book',
            entityType: 'appointment',
            entityId: created.id,
            outcome: 'SUCCESS',
            details: { slotId },
          },
          tx,
        );
        return created;
      });
      return { appointment: toAppointmentView(row), created: true };
    } catch (error) {
      // Lost the race: someone's booking committed between our read and insert.
      if (isUniqueViolation(error)) {
        const winner = await this.prisma.appointment.findFirst({
          where: { slotId, ...HOLDS_SLOT },
          select: { id: true, patientId: true },
        });
        if (winner) return this.alreadyHeld(caller, slotId, winner);
      }
      throw error;
    }
  }

  private async alreadyHeld(
    caller: Caller,
    slotId: string,
    holder: { id: string; patientId: string },
  ): Promise<BookingResult> {
    if (holder.patientId === caller.id) {
      const row = await this.prisma.appointment.findUniqueOrThrow({
        where: { id: holder.id },
        select: appointmentSelect,
      });
      return { appointment: toAppointmentView(row), created: false };
    }
    await this.recordFailedBooking(caller, slotId, 'SLOT_TAKEN');
    throw new ApiError(409, 'SLOT_TAKEN', 'This slot was just booked by someone else.');
  }

  private recordFailedBooking(
    caller: Caller,
    slotId: string,
    reason: 'SLOT_TAKEN' | 'SLOT_UNAVAILABLE',
  ): Promise<void> {
    return this.audit.record({
      caller,
      action: 'appointment.book',
      entityType: 'slot',
      entityId: slotId,
      outcome: 'FAILED',
      details: { reason },
    });
  }

  // ---------------------------------------------------------------- viewing

  /** The calling patient's own appointments. */
  async listMine(
    caller: Caller,
    when: 'upcoming' | 'past' = 'upcoming',
    now: Date = new Date(),
  ): Promise<AppointmentView[]> {
    const rows = await this.prisma.appointment.findMany({
      where:
        when === 'upcoming'
          ? { patientId: caller.id, ...upcoming(now) }
          : { patientId: caller.id, NOT: upcoming(now) },
      select: appointmentSelect,
      orderBy: { slot: { startsAt: when === 'upcoming' ? 'asc' : 'desc' } },
    });
    return rows.map(toAppointmentView);
  }

  /**
   * One appointment, for its patient, its doctor, or a receptionist of its
   * clinic. Anyone else gets "not found", and the attempt is audited.
   */
  async getOne(caller: Caller, appointmentId: string): Promise<AppointmentView> {
    const row = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: appointmentSelect,
    });
    if (!row) throw notFound();

    if (!(await this.canSee(caller, row))) {
      await this.audit.record({
        caller,
        action: 'appointment.read',
        entityType: 'appointment',
        entityId: appointmentId,
        outcome: 'DENIED',
      });
      throw notFound();
    }
    return toAppointmentView(row);
  }

  private async canSee(caller: Caller, row: AppointmentRow): Promise<boolean> {
    if (hasRole(caller, 'PATIENT')) return row.patientId === caller.id;
    if (hasRole(caller, 'DOCTOR') && row.slot.doctorId === caller.id) return true;
    return (
      hasRole(caller, 'RECEPTIONIST') &&
      (await this.isAssigned(caller.id, row.slot.clinicId))
    );
  }

  /** The clinics a staff member is assigned to. */
  async listMyClinics(caller: Caller): Promise<ClinicView[]> {
    const rows = await this.prisma.staffClinic.findMany({
      where: { staffId: caller.id, clinic: { active: true } },
      select: { clinic: { select: clinicSelect } },
      orderBy: { clinic: { nameEn: 'asc' } },
    });
    return rows.map((r) => toClinicView(r.clinic));
  }

  /**
   * A clinic's appointments for one Cairo day (default today), for a
   * receptionist assigned to it. Cancelled ones are left out.
   */
  async listClinicDay(
    caller: Caller,
    clinicId: string,
    day?: string,
    now: Date = new Date(),
  ): Promise<AppointmentView[]> {
    if (!(await this.isAssigned(caller.id, clinicId))) {
      await this.audit.record({
        caller,
        action: 'clinic.appointments.read',
        entityType: 'clinic',
        entityId: clinicId,
        outcome: 'DENIED',
      });
      throw notFound();
    }

    const { start, end } = cairoDayRange(day ?? cairoToday(now));
    const rows = await this.prisma.appointment.findMany({
      where: { ...HOLDS_SLOT, slot: { clinicId, startsAt: { gte: start, lt: end } } },
      select: appointmentSelect,
      orderBy: { slot: { startsAt: 'asc' } },
    });
    return rows.map(toAppointmentView);
  }

  private async isAssigned(staffId: string, clinicId: string): Promise<boolean> {
    const assignment = await this.prisma.staffClinic.findUnique({
      where: { staffId_clinicId: { staffId, clinicId } },
      select: { clinicId: true },
    });
    return assignment !== null;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}

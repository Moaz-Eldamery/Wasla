import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AppointmentStatus } from '../../generated/prisma/enums.js';
import { ApiError, notFound } from '../../shared/api-error.js';
import { AuditService } from '../../shared/audit.service.js';
import { cairoToday } from '../../shared/cairo-time.js';
import type { Caller } from '../../shared/caller.js';
import { PrismaService } from '../../shared/prisma.service.js';
import {
  AppointmentsService,
  type AppointmentView,
} from '../appointments/appointments.service.js';
import {
  queueItemSelect,
  toQueueItemView,
  type QueueBoardView,
  type QueueItemView,
  type QueuePositionView,
} from './queue.views.js';

/** A doctor's line in a clinic: their checked-in patients there (business.md). */
function line(
  clinicId: string,
  doctorId: string,
): Prisma.AppointmentWhereInput {
  return { status: 'CHECKED_IN', slot: { clinicId, doctorId } };
}

/** Check-in order. The ID breaks ties, so everyone agrees on who is first. */
const CHECK_IN_ORDER = [
  { checkedInAt: 'asc' },
  { id: 'asc' },
] satisfies Prisma.AppointmentOrderByWithRelationInput[];

function invalidTransition(message: string): ApiError {
  return new ApiError(409, 'INVALID_TRANSITION', message);
}

/**
 * IQueue: check-in, calling the next patient, finishing the visit, and
 * where everyone is in line. Other modules use this service, never the
 * module's internals.
 */
@Injectable()
export class QueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly appointments: AppointmentsService,
  ) {}

  // ---------------------------------------------------------------- moving through the visit

  /**
   * BOOKED → CHECKED_IN, by a receptionist of the appointment's clinic, on
   * the appointment's Cairo day only (late arrivals that day still count).
   */
  async checkIn(
    caller: Caller,
    appointmentId: string,
    now: Date = new Date(),
  ): Promise<AppointmentView> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        status: true,
        slot: { select: { clinicId: true, startsAt: true } },
      },
    });
    if (!appointment) throw notFound();
    if (!(await this.isAssigned(caller.id, appointment.slot.clinicId))) {
      throw await this.denied(
        caller,
        'appointment.check_in',
        'appointment',
        appointmentId,
      );
    }

    if (appointment.status !== 'BOOKED') {
      throw invalidTransition(
        `Only a booked appointment can be checked in, not a ${appointment.status} one.`,
      );
    }
    if (cairoToday(appointment.slot.startsAt) !== cairoToday(now)) {
      throw invalidTransition(
        'Patients can only be checked in on the day of their appointment.',
      );
    }

    await this.prisma.$transaction((tx) =>
      this.move(
        tx,
        caller,
        appointmentId,
        'BOOKED',
        'CHECKED_IN',
        { checkedInAt: now },
        'appointment.check_in',
      ),
    );
    return this.appointments.view(appointmentId);
  }

  /**
   * CHECKED_IN → IN_CONSULTATION for the earliest patient in the calling
   * doctor's line in this clinic. A doctor sees one patient at a time.
   */
  async callNext(
    caller: Caller,
    clinicId: string,
    now: Date = new Date(),
  ): Promise<AppointmentView> {
    if (!(await this.isAssigned(caller.id, clinicId))) {
      throw await this.denied(caller, 'queue.call_next', 'clinic', clinicId);
    }

    const appointmentId = await this.prisma.$transaction(async (tx) => {
      // One call at a time per doctor, until this transaction ends: a double
      // press (or two tabs) can't call in two patients.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`queue.call_next:${caller.id}`}))`;

      const current = await tx.appointment.findFirst({
        where: { status: 'IN_CONSULTATION', slot: { doctorId: caller.id } },
        select: { id: true },
      });
      if (current) {
        throw new ApiError(
          409,
          'ALREADY_IN_CONSULTATION',
          'Finish the current visit before calling the next patient.',
        );
      }

      const next = await tx.appointment.findFirst({
        where: line(clinicId, caller.id),
        orderBy: CHECK_IN_ORDER,
        select: { id: true },
      });
      if (!next) throw new ApiError(409, 'QUEUE_EMPTY', 'No one is waiting.');

      await this.move(
        tx,
        caller,
        next.id,
        'CHECKED_IN',
        'IN_CONSULTATION',
        { startedAt: now },
        'appointment.call_in',
      );
      return next.id;
    });
    return this.appointments.view(appointmentId);
  }

  /** IN_CONSULTATION → COMPLETED, by the appointment's own doctor. */
  async complete(
    caller: Caller,
    appointmentId: string,
    now: Date = new Date(),
  ): Promise<AppointmentView> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { status: true, slot: { select: { doctorId: true } } },
    });
    if (!appointment) throw notFound();
    if (appointment.slot.doctorId !== caller.id) {
      throw await this.denied(
        caller,
        'appointment.complete',
        'appointment',
        appointmentId,
      );
    }

    if (appointment.status !== 'IN_CONSULTATION') {
      throw invalidTransition(
        `Only a visit in consultation can be completed, not a ${appointment.status} one.`,
      );
    }

    await this.prisma.$transaction((tx) =>
      this.move(
        tx,
        caller,
        appointmentId,
        'IN_CONSULTATION',
        'COMPLETED',
        { completedAt: now },
        'appointment.complete',
      ),
    );
    return this.appointments.view(appointmentId);
  }

  /**
   * Changes the status only if it is still `from`, so of two simultaneous
   * changes exactly one goes through. Audited in the same transaction.
   */
  private async move(
    tx: Prisma.TransactionClient,
    caller: Caller,
    appointmentId: string,
    from: AppointmentStatus,
    to: AppointmentStatus,
    times: Prisma.AppointmentUpdateManyMutationInput,
    action: string,
  ): Promise<void> {
    const { count } = await tx.appointment.updateMany({
      where: { id: appointmentId, status: from },
      data: { ...times, status: to },
    });
    if (count === 0) {
      throw invalidTransition(
        'This appointment was changed by someone else. Reload and try again.',
      );
    }
    await this.audit.record(
      {
        caller,
        action,
        entityType: 'appointment',
        entityId: appointmentId,
        outcome: 'SUCCESS',
        details: { from, to },
      },
      tx,
    );
  }

  // ---------------------------------------------------------------- seeing the queue

  /**
   * Who is waiting and who is with a doctor in a clinic, for staff assigned
   * to it. Every doctor's patients, each labelled with their doctor.
   */
  async getClinicQueue(
    caller: Caller,
    clinicId: string,
  ): Promise<QueueBoardView> {
    if (!(await this.isAssigned(caller.id, clinicId))) {
      throw await this.denied(caller, 'queue.read', 'clinic', clinicId);
    }

    const [waiting, inConsultation] = await Promise.all([
      this.items({ status: 'CHECKED_IN', slot: { clinicId } }, CHECK_IN_ORDER),
      this.items({ status: 'IN_CONSULTATION', slot: { clinicId } }, [
        { startedAt: 'asc' },
      ]),
    ]);
    return { clinicId, waiting, inConsultation };
  }

  /**
   * How many people are ahead of the calling patient: those in the same
   * doctor's line who checked in earlier. Only while checked in.
   */
  async getPosition(
    caller: Caller,
    appointmentId: string,
  ): Promise<QueuePositionView> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        status: true,
        patientId: true,
        checkedInAt: true,
        slot: { select: { clinicId: true, doctorId: true } },
      },
    });
    if (!appointment) throw notFound();
    if (appointment.patientId !== caller.id) {
      throw await this.denied(
        caller,
        'queue.position.read',
        'appointment',
        appointmentId,
      );
    }

    const { id, status, checkedInAt, slot } = appointment;
    if (status !== 'CHECKED_IN' || !checkedInAt) {
      return { appointmentId: id, status, peopleAhead: null };
    }

    const peopleAhead = await this.prisma.appointment.count({
      where: {
        ...line(slot.clinicId, slot.doctorId),
        OR: [
          { checkedInAt: { lt: checkedInAt } },
          { checkedInAt, id: { lt: id } },
        ],
      },
    });
    return { appointmentId: id, status, peopleAhead };
  }

  private async items(
    where: Prisma.AppointmentWhereInput,
    orderBy: Prisma.AppointmentOrderByWithRelationInput[],
  ): Promise<QueueItemView[]> {
    const rows = await this.prisma.appointment.findMany({
      where,
      orderBy,
      select: queueItemSelect,
    });
    return rows.map(toQueueItemView);
  }

  // ---------------------------------------------------------------- access

  private async isAssigned(
    staffId: string,
    clinicId: string,
  ): Promise<boolean> {
    const assignment = await this.prisma.staffClinic.findUnique({
      where: { staffId_clinicId: { staffId, clinicId } },
      select: { clinicId: true },
    });
    return assignment !== null;
  }

  /** Audits a refused attempt and returns the "not found" that hides the record. */
  private async denied(
    caller: Caller,
    action: string,
    entityType: 'appointment' | 'clinic',
    entityId: string,
  ): Promise<ApiError> {
    await this.audit.record({
      caller,
      action,
      entityType,
      entityId,
      outcome: 'DENIED',
    });
    return notFound();
  }
}

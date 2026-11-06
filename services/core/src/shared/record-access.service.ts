import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { notFound } from './api-error.js';
import { AuditService } from './audit.service.js';
import { hasRole, type Caller } from './caller.js';
import { PrismaService } from './prisma.service.js';

/** Role and record ownership for clinical records; refusals survive transaction rollback. */
@Injectable()
export class RecordAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async doctorVisit(
    caller: Caller,
    appointmentId: string,
    action: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const visit = await db.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        status: true,
        slot: { select: { doctorId: true, clinicId: true } },
      },
    });
    if (
      !visit ||
      !hasRole(caller, 'DOCTOR') ||
      visit.slot.doctorId !== caller.id ||
      !(await this.assigned(db, caller.id, visit.slot.clinicId))
    ) {
      return this.deny(caller, action, 'appointment', appointmentId);
    }
    return visit;
  }

  async patientVisit(
    caller: Caller,
    appointmentId: string,
    action: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const visit = await db.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        patientId: true,
        status: true,
        completedAt: true,
        slot: { select: { doctor: { select: { name: true } } } },
      },
    });
    if (
      !visit ||
      !hasRole(caller, 'PATIENT') ||
      visit.patientId !== caller.id
    ) {
      return this.deny(caller, action, 'appointment', appointmentId);
    }
    return visit;
  }

  async test(
    caller: Caller,
    testId: string,
    permission: 'doctor' | 'lab' | 'download',
    action: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const test = await db.testOrder.findUnique({
      where: { id: testId },
      select: {
        id: true,
        status: true,
        clinicId: true,
        orderedById: true,
        appointment: {
          select: {
            patientId: true,
            slot: { select: { doctorId: true, clinicId: true } },
          },
        },
      },
    });
    if (!test) return this.deny(caller, action, 'test_order', testId);
    const doctor =
      permission !== 'lab' &&
      hasRole(caller, 'DOCTOR') &&
      test.orderedById === caller.id &&
      test.appointment.slot.doctorId === caller.id &&
      (await this.assigned(db, caller.id, test.appointment.slot.clinicId));
    const lab =
      permission !== 'doctor' &&
      hasRole(caller, 'LAB') &&
      (await this.assigned(db, caller.id, test.clinicId));
    const patient =
      permission === 'download' &&
      hasRole(caller, 'PATIENT') &&
      test.appointment.patientId === caller.id &&
      test.status === 'RELEASED';
    if (!doctor && !lab && !patient)
      return this.deny(caller, action, 'test_order', testId);
    return test;
  }

  private async assigned(
    db: Prisma.TransactionClient,
    staffId: string,
    clinicId: string,
  ) {
    return Boolean(
      await db.staffClinic.findUnique({
        where: { staffId_clinicId: { staffId, clinicId } },
        select: { staffId: true },
      }),
    );
  }

  private async deny(
    caller: Caller,
    action: string,
    entityType: string,
    entityId: string,
  ): Promise<never> {
    await this.audit.record({
      caller,
      action,
      entityType,
      entityId,
      outcome: 'DENIED',
    });
    throw notFound();
  }
}

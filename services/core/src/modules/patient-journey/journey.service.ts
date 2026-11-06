import { Injectable } from '@nestjs/common';
import type { JourneyStageCode } from '../../generated/prisma/enums.js';
import { ApiError, notFound } from '../../shared/api-error.js';
import { AuditService } from '../../shared/audit.service.js';
import type { Caller } from '../../shared/caller.js';
import { PrismaService } from '../../shared/prisma.service.js';
import {
  journeyAppointmentSelect,
  journeyStageSelect,
  toJourneyView,
  type JourneyAppointmentRow,
  type JourneyView,
} from './journey.views.js';

export type { JourneyView } from './journey.views.js';

/**
 * Resolves which stage of the visit the patient is in from the appointment
 * status and its ordered tests:
 * - `BOOKED` -> `BOOKED` (at the appointment clinic)
 * - `CHECKED_IN` -> `CHECKED_IN` (waiting at the appointment clinic)
 * - `IN_CONSULTATION` with an unreleased test (`REQUESTED` / `IN_PROGRESS` /
 *   `AWAITING_REVIEW`) -> `TEST_ORDERED` (at the test's lab/radiology clinic)
 * - `IN_CONSULTATION` with a released test (`RELEASED`) and no pending tests
 *   -> `RESULT_READY` (at the appointment clinic)
 * - `IN_CONSULTATION` with no tests -> `WITH_DOCTOR` (at the appointment clinic)
 * - `COMPLETED` with an unreleased test -> `TEST_ORDERED` (at the test clinic)
 * - `COMPLETED` (all tests released or no tests) -> `DONE` (`location = null`)
 */
export function resolveJourneyStage(appointment: JourneyAppointmentRow): {
  stage: JourneyStageCode;
  testClinic: JourneyAppointmentRow['testOrders'][number]['clinic'] | null;
} {
  const pendingTest = appointment.testOrders.find(
    (t) => t.status !== 'RELEASED',
  );
  const releasedTest = appointment.testOrders.find(
    (t) => t.status === 'RELEASED',
  );

  switch (appointment.status) {
    case 'BOOKED':
      return { stage: 'BOOKED', testClinic: null };

    case 'CHECKED_IN':
      return { stage: 'CHECKED_IN', testClinic: null };

    case 'IN_CONSULTATION':
      if (pendingTest) {
        return { stage: 'TEST_ORDERED', testClinic: pendingTest.clinic };
      }
      if (releasedTest) {
        return { stage: 'RESULT_READY', testClinic: releasedTest.clinic };
      }
      return { stage: 'WITH_DOCTOR', testClinic: null };

    case 'COMPLETED':
      if (pendingTest) {
        return { stage: 'TEST_ORDERED', testClinic: pendingTest.clinic };
      }
      return { stage: 'DONE', testClinic: null };

    case 'CANCELLED':
    case 'NO_SHOW':
      return { stage: 'DONE', testClinic: null };
  }
}

/**
 * IJourney: tells the patient where they are in their visit, what to do next,
 * and where to go. Stages and messages are read from `core.journey_stages`,
 * never hard-coded in the service.
 */
@Injectable()
export class JourneyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getJourney(caller: Caller, appointmentId: string): Promise<JourneyView> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: journeyAppointmentSelect,
    });
    if (!appointment) throw notFound();

    if (appointment.patientId !== caller.id) {
      throw await this.denied(caller, appointmentId);
    }

    const { stage, testClinic } = resolveJourneyStage(appointment);
    const stageRow = await this.prisma.journeyStage.findUnique({
      where: { code: stage },
      select: journeyStageSelect,
    });
    if (!stageRow) {
      throw new ApiError(
        500,
        'INTERNAL',
        `Journey stage ${stage} is missing from core.journey_stages.`,
      );
    }

    const location =
      stageRow.location === 'APPOINTMENT_CLINIC'
        ? appointment.slot.clinic
        : stageRow.location === 'TEST_CLINIC'
          ? (testClinic ?? appointment.slot.clinic)
          : null;

    return toJourneyView(appointment.id, stageRow, location);
  }

  private async denied(caller: Caller, appointmentId: string): Promise<ApiError> {
    await this.audit.record({
      caller,
      action: 'journey.read',
      entityType: 'appointment',
      entityId: appointmentId,
      outcome: 'DENIED',
    });
    return notFound();
  }
}

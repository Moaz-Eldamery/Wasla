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
 * - `IN_CONSULTATION` or `COMPLETED` with a test the lab hasn't done yet
 *   (`REQUESTED` / `IN_PROGRESS`) -> `TEST_ORDERED` (at the test's lab or
 *   radiology clinic)
 * - `IN_CONSULTATION` with a released test (`RELEASED`) -> `RESULT_READY`
 *   (at the appointment clinic)
 * - `IN_CONSULTATION` otherwise -> `WITH_DOCTOR` (at the appointment clinic).
 *   This includes tests `AWAITING_REVIEW`: the lab is done, so the patient
 *   goes back to the doctor rather than to the lab.
 * - `COMPLETED` otherwise -> `DONE` (`location = null`). A result still
 *   `AWAITING_REVIEW` reaches the patient once the doctor releases it.
 */
export function resolveJourneyStage(appointment: JourneyAppointmentRow): {
  stage: JourneyStageCode;
  testClinic: JourneyAppointmentRow['testOrders'][number]['clinic'] | null;
} {
  // Only tests the patient still has to go to the lab for. A test
  // AWAITING_REVIEW is done at the lab and waits for the doctor.
  const pendingTest = appointment.testOrders.find(
    (t) => t.status === 'REQUESTED' || t.status === 'IN_PROGRESS',
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

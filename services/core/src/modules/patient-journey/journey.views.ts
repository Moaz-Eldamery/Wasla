// What the journey endpoint returns (Journey in contracts/openapi.yaml),
// and the Prisma selects that load the appointment and its journey stage.
import type { Prisma } from '../../generated/prisma/client.js';
import type { JourneyStageCode } from '../../generated/prisma/enums.js';
import {
  clinicSelect,
  toClinicView,
  type ClinicRow,
  type ClinicView,
  type LocalizedText,
} from '../../shared/clinic.views.js';

export interface JourneyView {
  appointmentId: string;
  stage: JourneyStageCode;
  title: LocalizedText;
  nextStep: LocalizedText;
  location: ClinicView | null;
}

export const journeyAppointmentSelect = {
  id: true,
  patientId: true,
  status: true,
  slot: {
    select: {
      clinic: { select: clinicSelect },
    },
  },
  testOrders: {
    select: {
      id: true,
      status: true,
      orderedAt: true,
      clinic: { select: clinicSelect },
    },
    orderBy: [{ orderedAt: 'desc' }, { id: 'desc' }],
  },
} satisfies Prisma.AppointmentSelect;

export const journeyStageSelect = {
  code: true,
  sortOrder: true,
  titleAr: true,
  titleEn: true,
  nextStepAr: true,
  nextStepEn: true,
  location: true,
} satisfies Prisma.JourneyStageSelect;

export type JourneyAppointmentRow = Prisma.AppointmentGetPayload<{
  select: typeof journeyAppointmentSelect;
}>;
export type JourneyStageRow = Prisma.JourneyStageGetPayload<{
  select: typeof journeyStageSelect;
}>;

export function toJourneyView(
  appointmentId: string,
  stageRow: JourneyStageRow,
  locationClinic: ClinicRow | null,
): JourneyView {
  return {
    appointmentId,
    stage: stageRow.code,
    title: { ar: stageRow.titleAr, en: stageRow.titleEn },
    nextStep: { ar: stageRow.nextStepAr, en: stageRow.nextStepEn },
    location: locationClinic ? toClinicView(locationClinic) : null,
  };
}

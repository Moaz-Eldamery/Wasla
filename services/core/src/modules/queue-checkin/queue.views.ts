// What the queue endpoints return (QueueBoard, QueueItem and QueuePosition in
// contracts/openapi.yaml), and the Prisma select that loads a queue item.
import type { Prisma } from '../../generated/prisma/client.js';
import type { AppointmentStatus } from '../../generated/prisma/enums.js';

/** No medical details: receptionists see the board too. */
export interface QueueItemView {
  appointmentId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  checkedInAt: Date;
  startedAt: Date | null;
}

export interface QueueBoardView {
  clinicId: string;
  waiting: QueueItemView[];
  inConsultation: QueueItemView[];
}

export interface QueuePositionView {
  appointmentId: string;
  status: AppointmentStatus;
  peopleAhead: number | null;
}

export const queueItemSelect = {
  id: true,
  checkedInAt: true,
  startedAt: true,
  patient: { select: { name: true } },
  slot: { select: { doctor: { select: { id: true, name: true } } } },
} satisfies Prisma.AppointmentSelect;

type QueueItemRow = Prisma.AppointmentGetPayload<{
  select: typeof queueItemSelect;
}>;

export function toQueueItemView(a: QueueItemRow): QueueItemView {
  return {
    appointmentId: a.id,
    patientName: a.patient.name,
    doctorId: a.slot.doctor.id,
    doctorName: a.slot.doctor.name,
    // Only checked-in and in-consultation appointments are on the board, and both have it.
    checkedInAt: a.checkedInAt!,
    startedAt: a.startedAt,
  };
}

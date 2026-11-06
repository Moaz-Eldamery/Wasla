import type { Prisma } from '../../generated/prisma/client.js';
import { clinicSelect, toClinicView } from '../../shared/clinic.views.js';

export const resultFileSelect = {
  fileName: true,
  contentType: true,
  sizeBytes: true,
  uploadedAt: true,
} satisfies Prisma.TestResultFileSelect;

export const testOrderSelect = {
  id: true,
  appointmentId: true,
  testName: true,
  instructions: true,
  status: true,
  orderedAt: true,
  startedAt: true,
  releasedAt: true,
  orderedBy: { select: { name: true } },
  appointment: { select: { patient: { select: { name: true } } } },
  clinic: { select: clinicSelect },
  resultFile: { select: resultFileSelect },
} satisfies Prisma.TestOrderSelect;

export type TestOrderRow = Prisma.TestOrderGetPayload<{
  select: typeof testOrderSelect;
}>;
type FileRow = Prisma.TestResultFileGetPayload<{
  select: typeof resultFileSelect;
}>;

export function toFileView(file: FileRow | null) {
  return file ? { ...file, uploadedAt: file.uploadedAt.toISOString() } : null;
}

export function toTestView(test: TestOrderRow) {
  return {
    id: test.id,
    appointmentId: test.appointmentId,
    patientName: test.appointment.patient.name,
    testName: test.testName,
    instructions: test.instructions,
    clinic: toClinicView(test.clinic),
    status: test.status,
    orderedByName: test.orderedBy.name,
    orderedAt: test.orderedAt.toISOString(),
    startedAt: test.startedAt?.toISOString() ?? null,
    releasedAt: test.releasedAt?.toISOString() ?? null,
    file: toFileView(test.resultFile),
  };
}

import type { Prisma } from '../../generated/prisma/client.js';

export const visitNotesSelect = {
  appointmentId: true,
  version: true,
  clinicalNotes: true,
  patientSummary: true,
  author: { select: { name: true } },
  createdAt: true,
} satisfies Prisma.VisitNoteVersionSelect;

export type VisitNotesRow = Prisma.VisitNoteVersionGetPayload<{
  select: typeof visitNotesSelect;
}>;

export function toVisitNotesView(note: VisitNotesRow) {
  return {
    appointmentId: note.appointmentId,
    version: note.version,
    clinicalNotes: note.clinicalNotes,
    patientSummary: note.patientSummary,
    authorName: note.author.name,
    createdAt: note.createdAt.toISOString(),
  };
}

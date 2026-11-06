import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { ApiError, notFound } from '../../shared/api-error.js';
import { AuditService } from '../../shared/audit.service.js';
import type { Caller } from '../../shared/caller.js';
import { PrismaService } from '../../shared/prisma.service.js';
import { RecordAccessService } from '../../shared/record-access.service.js';
import type { SaveVisitNotesDto } from './visit-notes.dto.js';
import { toVisitNotesView, visitNotesSelect } from './visit-notes.views.js';

/** Versioned visit documentation, part of IClinical. No saved version is updated. */
@Injectable()
export class VisitNotesService {
  private readonly logger = new Logger(VisitNotesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: RecordAccessService,
  ) {}

  async save(caller: Caller, appointmentId: string, input: SaveVisitNotesDto) {
    return this.protect(() =>
      this.prisma.$transaction(async (tx) => {
        // Lock the visit even for the first save, when no note row exists yet.
        await tx.$queryRaw`SELECT id FROM core.appointments WHERE id = ${appointmentId}::uuid FOR UPDATE`;
        await this.access.doctorVisit(caller, appointmentId, 'notes.save', tx);
        const latest = await tx.visitNoteVersion.findFirst({
          where: { appointmentId },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        if (input.baseVersion !== (latest?.version ?? 0)) {
          throw new ApiError(
            409,
            'VERSION_CONFLICT',
            'The notes changed since you opened them. Reload the latest version before saving.',
          );
        }
        const note = await tx.visitNoteVersion.create({
          data: {
            appointmentId,
            version: input.baseVersion + 1,
            clinicalNotes: input.clinicalNotes,
            patientSummary: input.patientSummary ?? null,
            authorId: caller.id,
          },
          select: visitNotesSelect,
        });
        await this.record(
          caller,
          'notes.save',
          appointmentId,
          tx,
          note.version,
        );
        return toVisitNotesView(note);
      }),
    );
  }

  async latest(caller: Caller, appointmentId: string) {
    return this.protect(() =>
      this.prisma.$transaction(async (tx) => {
        await this.access.doctorVisit(caller, appointmentId, 'notes.read', tx);
        const note = await tx.visitNoteVersion.findFirst({
          where: { appointmentId },
          orderBy: { version: 'desc' },
          select: visitNotesSelect,
        });
        if (!note) throw notFound();
        await this.record(
          caller,
          'notes.read',
          appointmentId,
          tx,
          note.version,
        );
        return toVisitNotesView(note);
      }),
    );
  }

  async versions(caller: Caller, appointmentId: string) {
    return this.protect(() =>
      this.prisma.$transaction(async (tx) => {
        await this.access.doctorVisit(
          caller,
          appointmentId,
          'notes.versions',
          tx,
        );
        const notes = await tx.visitNoteVersion.findMany({
          where: { appointmentId },
          orderBy: { version: 'desc' },
          select: visitNotesSelect,
        });
        await this.record(caller, 'notes.versions', appointmentId, tx);
        return notes.map(toVisitNotesView);
      }),
    );
  }

  async summary(caller: Caller, appointmentId: string) {
    return this.protect(() =>
      this.prisma.$transaction(async (tx) => {
        const visit = await this.access.patientVisit(
          caller,
          appointmentId,
          'notes.summary',
          tx,
        );
        if (visit.status !== 'COMPLETED' || !visit.completedAt)
          throw this.unavailable();
        // Deliberately never fetch clinicalNotes on the patient path.
        const note = await tx.visitNoteVersion.findFirst({
          where: { appointmentId },
          orderBy: { version: 'desc' },
          select: { version: true, patientSummary: true },
        });
        if (!note?.patientSummary?.trim()) throw this.unavailable();
        await this.record(
          caller,
          'notes.summary',
          appointmentId,
          tx,
          note.version,
        );
        return {
          appointmentId,
          doctorName: visit.slot.doctor.name,
          completedAt: visit.completedAt.toISOString(),
          summary: note.patientSummary,
        };
      }),
    );
  }

  private unavailable() {
    return new ApiError(
      409,
      'NOT_YET_AVAILABLE',
      'The visit summary is not available yet.',
    );
  }

  private record(
    caller: Caller,
    action: string,
    appointmentId: string,
    tx: Prisma.TransactionClient,
    version?: number,
  ) {
    return this.audit.record(
      {
        caller,
        action,
        entityType: 'appointment',
        entityId: appointmentId,
        outcome: 'SUCCESS',
        ...(version === undefined ? {} : { details: { version } }),
      },
      tx,
    );
  }

  private async protect<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      // Database errors may embed query arguments. Never let clinical text
      // reach the global exception logger or the HTTP error response.
      this.logger.error('Visit notes operation failed.');
      throw new ApiError(
        500,
        'INTERNAL',
        'The visit notes request could not be completed.',
      );
    }
  }
}

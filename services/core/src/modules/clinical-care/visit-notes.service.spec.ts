import { Logger } from '@nestjs/common';
import type { AuditService } from '../../shared/audit.service.js';
import type { Caller } from '../../shared/caller.js';
import type { PrismaService } from '../../shared/prisma.service.js';
import type { RecordAccessService } from '../../shared/record-access.service.js';
import { VisitNotesService } from './visit-notes.service.js';

const caller: Caller = { id: 'doctor', type: 'STAFF', roles: ['DOCTOR'] };
const row = {
  appointmentId: 'visit',
  version: 1,
  clinicalNotes: 'Synthetic private note',
  patientSummary: 'Synthetic summary',
  author: { name: 'Synthetic doctor' },
  createdAt: new Date('2026-11-06T10:00:00Z'),
};

function setup() {
  const prisma = {
    $queryRaw: vi.fn(),
    visitNoteVersion: {
      findFirst: vi.fn().mockResolvedValue(row),
      findMany: vi.fn().mockResolvedValue([row]),
      create: vi.fn().mockResolvedValue({ ...row, version: 2 }),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const access = {
    doctorVisit: vi.fn().mockResolvedValue({ id: 'visit' }),
    patientVisit: vi
      .fn()
      .mockResolvedValue({
        status: 'COMPLETED',
        completedAt: row.createdAt,
        slot: { doctor: { name: 'Synthetic doctor' } },
      }),
  };
  const service = new VisitNotesService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    access as unknown as RecordAccessService,
  );
  return { prisma, audit, access, service };
}

describe('visit notes', () => {
  it('appends a new snapshot, checks ownership, and audits the version in the same transaction', async () => {
    const { service, prisma, audit, access } = setup();
    const input = {
      baseVersion: 1,
      clinicalNotes: 'Edited synthetic note',
      patientSummary: 'Edited summary',
    };
    await service.save(caller, 'visit', input);
    expect(access.doctorVisit).toHaveBeenCalledWith(
      caller,
      'visit',
      'notes.save',
      prisma,
    );
    expect(prisma.visitNoteVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          appointmentId: 'visit',
          version: 2,
          clinicalNotes: input.clinicalNotes,
          patientSummary: input.patientSummary,
          authorId: caller.id,
        },
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'notes.save',
        details: { version: 2 },
      }),
      prisma,
    );
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain(
      'Edited synthetic note',
    );
  });

  it('starts at version one and stores an omitted summary as null', async () => {
    const { service, prisma } = setup();
    prisma.visitNoteVersion.findFirst.mockResolvedValue(null);
    await service.save(caller, 'visit', {
      baseVersion: 0,
      clinicalNotes: 'First note',
    });
    expect(prisma.visitNoteVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ version: 1, patientSummary: null }),
      }),
    );
  });

  it('rejects stale versions without inserting or recording a successful edit', async () => {
    const { service, prisma, audit } = setup();
    await expect(
      service.save(caller, 'visit', {
        baseVersion: 0,
        clinicalNotes: 'Stale edit',
      }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    expect(prisma.visitNoteVersion.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('returns 404 when the doctor has no saved notes', async () => {
    const { service, prisma } = setup();
    prisma.visitNoteVersion.findFirst.mockResolvedValue(null);
    await expect(service.latest(caller, 'visit')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('audits reads of both the latest version and the history', async () => {
    const { service, audit } = setup();
    expect(await service.latest(caller, 'visit')).toMatchObject({
      version: 1,
      authorName: row.author.name,
      createdAt: row.createdAt.toISOString(),
    });
    expect(await service.versions(caller, 'visit')).toHaveLength(1);
    expect(audit.record.mock.calls.map(([entry]) => entry.action)).toEqual([
      'notes.read',
      'notes.versions',
    ]);
  });

  it('never fetches or returns clinical text on the patient summary path', async () => {
    const { service, prisma } = setup();
    const result = await service.summary(caller, 'visit');
    expect(result).toEqual({
      appointmentId: 'visit',
      doctorName: row.author.name,
      completedAt: row.createdAt.toISOString(),
      summary: row.patientSummary,
    });
    expect(prisma.visitNoteVersion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { version: true, patientSummary: true },
      }),
    );
    expect(result).not.toHaveProperty('clinicalNotes');
  });

  it('does not read any note before the visit is completed', async () => {
    const { service, access, prisma } = setup();
    access.patientVisit.mockResolvedValue({
      status: 'IN_CONSULTATION',
      completedAt: null,
      slot: { doctor: { name: 'Synthetic doctor' } },
    });
    await expect(service.summary(caller, 'visit')).rejects.toMatchObject({
      code: 'NOT_YET_AVAILABLE',
    });
    expect(prisma.visitNoteVersion.findFirst).not.toHaveBeenCalled();
  });

  it.each([null, '', '   '])(
    'does not fall back to an older summary when the latest summary is %s',
    async (patientSummary) => {
      const { service, prisma } = setup();
      prisma.visitNoteVersion.findFirst.mockResolvedValue({
        ...row,
        patientSummary,
      });
      await expect(service.summary(caller, 'visit')).rejects.toMatchObject({
        code: 'NOT_YET_AVAILABLE',
      });
    },
  );

  it('redacts unexpected database errors that could contain clinical query arguments', async () => {
    const { service, prisma } = setup();
    const logger = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    prisma.visitNoteVersion.create.mockRejectedValue(
      new Error('Database query: Synthetic private note'),
    );
    try {
      await expect(
        service.save(caller, 'visit', {
          baseVersion: 1,
          clinicalNotes: row.clinicalNotes,
        }),
      ).rejects.toMatchObject({ code: 'INTERNAL' });
      expect(logger).toHaveBeenCalledWith('Visit notes operation failed.');
      expect(JSON.stringify(logger.mock.calls)).not.toContain(
        row.clinicalNotes,
      );
    } finally {
      logger.mockRestore();
    }
  });
});

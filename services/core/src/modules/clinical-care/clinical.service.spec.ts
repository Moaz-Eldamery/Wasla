import { Readable } from 'node:stream';
import type { AuditService } from '../../shared/audit.service.js';
import type { Caller } from '../../shared/caller.js';
import type { FileStorageService } from '../../shared/file-storage.service.js';
import type { PrismaService } from '../../shared/prisma.service.js';
import type { RecordAccessService } from '../../shared/record-access.service.js';
import { ClinicalService } from './clinical.service.js';

const caller: Caller = { id: 'staff', type: 'STAFF', roles: ['LAB'] };
const file = {
  buffer: Buffer.from('%PDF-1.7\n'),
  size: 9,
  mimetype: 'application/pdf',
  originalname: 'result.pdf',
};
const row = {
  id: 'test',
  appointmentId: 'visit',
  testName: 'CBC',
  instructions: null,
  status: 'AWAITING_REVIEW',
  orderedAt: new Date(),
  startedAt: null,
  releasedAt: null,
  orderedBy: { name: 'Doctor' },
  appointment: { patient: { name: 'Synthetic patient' } },
  clinic: {
    id: 'lab',
    departmentId: 'dept',
    nameAr: 'Lab',
    nameEn: 'Lab',
    building: 'B',
    floor: '1',
    directionsAr: '',
    directionsEn: '',
  },
  resultFile: {
    fileName: 'private.pdf',
    contentType: 'application/pdf',
    sizeBytes: 9,
    uploadedAt: new Date(),
  },
};

function setup(status = 'IN_PROGRESS') {
  const prisma = {
    $queryRaw: vi.fn(),
    testOrder: {
      update: vi.fn().mockResolvedValue(row),
      findMany: vi.fn().mockResolvedValue([row]),
    },
    testResultFile: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'file',
        storageKey: 'old-key',
        ...row.resultFile,
      }),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const access = {
    test: vi.fn().mockResolvedValue({ status }),
    doctorVisit: vi.fn(),
  };
  const storage = {
    put: vi.fn(),
    remove: vi.fn(),
    get: vi.fn().mockResolvedValue(Readable.from('file')),
  };
  const service = new ClinicalService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    access as unknown as RecordAccessService,
    storage as unknown as FileStorageService,
  );
  return { prisma, audit, access, storage, service };
}

describe('clinical result transactions', () => {
  it('never exposes file metadata or internal statuses to a patient before release', async () => {
    const { service } = setup();
    expect(await service.listMyResults(caller)).toEqual([
      expect.objectContaining({
        status: 'WAITING_FOR_REVIEW',
        file: null,
        releasedAt: null,
      }),
    ]);
  });

  it('checks ownership before uploading anything to storage', async () => {
    const { access, storage, service } = setup();
    access.test.mockRejectedValue(new Error('denied'));
    await expect(service.uploadResult(caller, 'test', file)).rejects.toThrow(
      'denied',
    );
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('removes the new object if a release wins the race', async () => {
    const { storage, prisma, service, access } = setup('RELEASED');
    access.test.mockResolvedValueOnce({ status: 'IN_PROGRESS' });
    await expect(
      service.uploadResult(caller, 'test', file),
    ).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
    });
    const key = storage.put.mock.calls[0][0];
    expect(storage.remove).toHaveBeenCalledWith(key);
    expect(storage.remove).not.toHaveBeenCalledWith('old-key');
    expect(prisma.testResultFile.upsert).not.toHaveBeenCalled();
  });

  it('does not delete the old object if the audit write fails', async () => {
    const { storage, audit, service } = setup();
    audit.record.mockRejectedValue(new Error('audit unavailable'));
    await expect(service.uploadResult(caller, 'test', file)).rejects.toThrow(
      'audit unavailable',
    );
    expect(storage.remove).toHaveBeenCalledWith(storage.put.mock.calls[0][0]);
    expect(storage.remove).not.toHaveBeenCalledWith('old-key');
  });

  it('updates the file before removing the replaced private object', async () => {
    const { storage, prisma, service } = setup('AWAITING_REVIEW');
    await service.uploadResult(caller, 'test', file);
    expect(prisma.testResultFile.upsert).toHaveBeenCalled();
    expect(storage.remove).toHaveBeenCalledWith('old-key');
    expect(storage.remove.mock.invocationCallOrder[0]).toBeGreaterThan(
      prisma.$transaction.mock.invocationCallOrder[0],
    );
  });

  it('does not change test state when storage is unavailable', async () => {
    const { storage, prisma, service } = setup();
    storage.put.mockRejectedValue(new Error('storage offline'));
    await expect(service.uploadResult(caller, 'test', file)).rejects.toThrow(
      'storage offline',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires a stored file before releasing a result', async () => {
    const { prisma, service } = setup('AWAITING_REVIEW');
    prisma.testResultFile.findUnique.mockResolvedValue(null);
    await expect(service.releaseResult(caller, 'test')).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
    });
    expect(prisma.testOrder.update).not.toHaveBeenCalled();
  });

  it('closes an opened download if its audit cannot be committed', async () => {
    const { storage, audit, service } = setup('RELEASED');
    const stream = Readable.from('private result');
    storage.get.mockResolvedValue(stream);
    audit.record.mockRejectedValue(new Error('audit unavailable'));
    await expect(service.downloadResult(caller, 'test')).rejects.toThrow(
      'audit unavailable',
    );
    expect(stream.destroyed).toBe(true);
  });
});

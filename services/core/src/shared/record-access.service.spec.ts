import type { AuditService } from './audit.service.js';
import type { Caller } from './caller.js';
import type { PrismaService } from './prisma.service.js';
import { RecordAccessService } from './record-access.service.js';

const patient: Caller = { id: 'patient', type: 'PATIENT', roles: [] };
const doctor: Caller = { id: 'doctor', type: 'STAFF', roles: ['DOCTOR'] };
const lab: Caller = { id: 'lab', type: 'STAFF', roles: ['LAB'] };
const test = {
  id: 'test',
  status: 'AWAITING_REVIEW',
  clinicId: 'lab-clinic',
  orderedById: doctor.id,
  appointment: {
    patientId: patient.id,
    slot: { doctorId: doctor.id, clinicId: 'clinic' },
  },
};

function setup(row: typeof test | null = test) {
  const prisma = {
    testOrder: { findUnique: vi.fn().mockResolvedValue(row) },
    appointment: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'visit',
        status: 'IN_CONSULTATION',
        slot: test.appointment.slot,
      }),
    },
    staffClinic: {
      findUnique: vi.fn().mockResolvedValue({ staffId: 'assigned' }),
    },
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const access = new RecordAccessService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
  );
  return { prisma, audit, access };
}

describe('clinical record access', () => {
  it('allows only the owning patient to access the visit summary', async () => {
    const { access, prisma, audit } = setup();
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'visit',
      patientId: patient.id,
      status: 'COMPLETED',
      completedAt: new Date(),
      slot: { doctor: { name: 'Synthetic doctor' } },
    });
    await expect(
      access.patientVisit(patient, 'visit', 'notes.summary'),
    ).resolves.toMatchObject({ id: 'visit' });
    await expect(
      access.patientVisit(
        { ...patient, id: 'other' },
        'visit',
        'notes.summary',
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      access.patientVisit(doctor, 'visit', 'notes.summary'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'notes.summary', outcome: 'DENIED' }),
    );
  });

  it('allows only the ordering doctor assigned to the visit clinic', async () => {
    const { access, prisma } = setup();
    await expect(
      access.test(doctor, 'test', 'doctor', 'result.release'),
    ).resolves.toEqual(test);
    await expect(
      access.test(
        { ...doctor, id: 'another' },
        'test',
        'doctor',
        'result.release',
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    prisma.staffClinic.findUnique.mockResolvedValue(null);
    await expect(
      access.test(doctor, 'test', 'doctor', 'result.release'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('checks the lab assignment for this test, not any clinic', async () => {
    const { access, prisma } = setup();
    await access.test(lab, 'test', 'lab', 'result.upload');
    expect(prisma.staffClinic.findUnique).toHaveBeenCalledWith({
      where: { staffId_clinicId: { staffId: lab.id, clinicId: 'lab-clinic' } },
      select: { staffId: true },
    });
    prisma.staffClinic.findUnique.mockResolvedValue(null);
    await expect(
      access.test(lab, 'test', 'lab', 'result.upload'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it.each(['REQUESTED', 'IN_PROGRESS', 'AWAITING_REVIEW'])(
    'hides %s files from their own patient',
    async (status) => {
      const { access, audit } = setup({ ...test, status });
      await expect(
        access.test(patient, 'test', 'download', 'result.download'),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'DENIED',
          action: 'result.download',
        }),
      );
    },
  );

  it('allows only the owner to download a released result', async () => {
    const { access } = setup({ ...test, status: 'RELEASED' });
    await expect(
      access.test(patient, 'test', 'download', 'result.download'),
    ).resolves.toMatchObject({ status: 'RELEASED' });
    await expect(
      access.test(
        { ...patient, id: 'other' },
        'test',
        'download',
        'result.download',
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it.each(['ADMIN', 'RECEPTIONIST'] as const)(
    'does not let %s read clinical files',
    async (role) => {
      const { access } = setup({ ...test, status: 'RELEASED' });
      await expect(
        access.test(
          { id: 'staff', type: 'STAFF', roles: [role] },
          'test',
          'download',
          'result.download',
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    },
  );

  it('checks visit ownership before allowing a test order', async () => {
    const { access } = setup();
    await expect(
      access.doctorVisit(doctor, 'visit', 'test.order'),
    ).resolves.toMatchObject({ id: 'visit' });
    await expect(
      access.doctorVisit({ ...doctor, id: 'other' }, 'visit', 'test.order'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('audits missing and forbidden records the same way', async () => {
    const { access, audit } = setup(null);
    await expect(
      access.test(patient, 'missing', 'download', 'result.download'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'missing', outcome: 'DENIED' }),
    );
  });
});

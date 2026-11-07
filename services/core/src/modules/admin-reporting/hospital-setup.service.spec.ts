import type { AuditService } from '../../shared/audit.service.js';
import type { Caller } from '../../shared/caller.js';
import type { PrismaService } from '../../shared/prisma.service.js';
import { HospitalSetupService, sortDepartments } from './hospital-setup.service.js';

const admin: Caller = { id: 'b0000000-0000-4000-8000-000000000009', type: 'STAFF', roles: ['ADMIN'] };
const CLINIC = 'c0000000-0000-4000-8000-000000000001';
const DEPT = 'd0000000-0000-4000-8000-000000000001';
const DOCTOR = 'e0000000-0000-4000-8000-000000000001';

function clinicRow(staff: { id: string; name: string; roles: string[]; active: boolean }[] = []) {
  return {
    id: CLINIC,
    departmentId: DEPT,
    nameAr: 'عيادة ١',
    nameEn: 'Clinic 1',
    building: 'A',
    floor: '1',
    directionsAr: 'يسار المصعد',
    directionsEn: 'Left of the lift',
    active: true,
    staff: staff.map((s) => ({ staff: s })),
  };
}

function setup() {
  const prisma = {
    department: { findMany: vi.fn(), findUnique: vi.fn().mockResolvedValue({ id: DEPT }), create: vi.fn(), update: vi.fn() },
    clinic: {
      findUnique: vi.fn().mockResolvedValue({ id: CLINIC }),
      findUniqueOrThrow: vi.fn().mockResolvedValue(clinicRow()),
      create: vi.fn(),
      update: vi.fn(),
    },
    account: { findUnique: vi.fn() },
    staffClinic: { upsert: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new HospitalSetupService(prisma as unknown as PrismaService, audit as unknown as AuditService);
  return { prisma, audit, service };
}

describe('sortDepartments', () => {
  it('puts clinical first, then lab, then radiology, each by English name', () => {
    const sorted = sortDepartments([
      { kind: 'RADIOLOGY' as const, name: { ar: '', en: 'Radiology' } },
      { kind: 'CLINICAL' as const, name: { ar: '', en: 'Pediatrics' } },
      { kind: 'LAB' as const, name: { ar: '', en: 'Lab' } },
      { kind: 'CLINICAL' as const, name: { ar: '', en: 'Cardiology' } },
    ]);
    expect(sorted.map((d) => d.name.en)).toEqual(['Cardiology', 'Pediatrics', 'Lab', 'Radiology']);
  });
});

describe('HospitalSetupService', () => {
  it('lists staff in a clinic by name, roles in screen order', async () => {
    const { prisma, service } = setup();
    prisma.department.findMany.mockResolvedValue([
      {
        id: DEPT,
        kind: 'CLINICAL',
        nameAr: 'الباطنة',
        nameEn: 'Internal Medicine',
        active: true,
        clinics: [
          clinicRow([
            { id: '2', name: 'Nadia Hassan', roles: ['RECEPTIONIST'], active: true },
            { id: '1', name: 'Dr. Rania Mostafa', roles: ['ADMIN', 'DOCTOR'], active: true },
          ]),
        ],
      },
    ]);
    const [dept] = await service.listDepartments();
    expect(dept.clinics[0].staff.map((s) => [s.name, s.roles])).toEqual([
      ['Dr. Rania Mostafa', ['DOCTOR', 'ADMIN']],
      ['Nadia Hassan', ['RECEPTIONIST']],
    ]);
  });

  it('deactivates a clinic and audits it in the same transaction', async () => {
    const { prisma, audit, service } = setup();
    prisma.clinic.update.mockResolvedValue({ ...clinicRow(), active: false });

    const clinic = await service.setClinicActive(admin, CLINIC, false);

    expect(clinic.active).toBe(false);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'clinic.deactivate', entityType: 'clinic', entityId: CLINIC }),
      prisma,
    );
  });

  it('answers NOT_FOUND for a clinic that does not exist', async () => {
    const { prisma, service } = setup();
    prisma.clinic.findUnique.mockResolvedValue(null);
    await expect(service.setClinicActive(admin, CLINIC, false)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(prisma.clinic.update).not.toHaveBeenCalled();
  });

  it('assigns an active doctor (harmless if already there)', async () => {
    const { prisma, service } = setup();
    prisma.account.findUnique.mockResolvedValue({ type: 'STAFF', roles: ['DOCTOR'], active: true });
    await service.assignStaff(admin, CLINIC, DOCTOR);
    expect(prisma.staffClinic.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { staffId: DOCTOR, clinicId: CLINIC }, update: {} }),
    );
  });

  it.each([
    ['an admin-only account', { type: 'STAFF', roles: ['ADMIN'], active: true }, 'VALIDATION_FAILED'],
    ['an inactive doctor', { type: 'STAFF', roles: ['DOCTOR'], active: false }, 'VALIDATION_FAILED'],
    ['a patient', { type: 'PATIENT', roles: [], active: true }, 'NOT_FOUND'],
  ])("won't assign %s", async (_name, account, code) => {
    const { prisma, service } = setup();
    prisma.account.findUnique.mockResolvedValue(account);
    await expect(service.assignStaff(admin, CLINIC, DOCTOR)).rejects.toMatchObject({ code });
    expect(prisma.staffClinic.upsert).not.toHaveBeenCalled();
  });

  it('removes someone from a clinic', async () => {
    const { prisma, service } = setup();
    await service.unassignStaff(admin, CLINIC, DOCTOR);
    expect(prisma.staffClinic.deleteMany).toHaveBeenCalledWith({ where: { staffId: DOCTOR, clinicId: CLINIC } });
  });
});

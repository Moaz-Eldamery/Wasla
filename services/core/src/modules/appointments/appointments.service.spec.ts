import { Prisma } from '../../generated/prisma/client.js';
import { ApiError } from '../../shared/api-error.js';
import type { AuditService } from '../../shared/audit.service.js';
import type { Caller } from '../../shared/caller.js';
import type { PrismaService } from '../../shared/prisma.service.js';
import { AppointmentsService } from './appointments.service.js';

const NOW = new Date('2026-11-05T10:00:00Z');
const LATER = new Date('2026-11-06T10:00:00Z');
const SLOT = 'a0000000-0000-4000-8000-000000000001';
const APPT = 'a0000000-0000-4000-8000-000000000002';

const alice: Caller = { id: 'b0000000-0000-4000-8000-000000000001', type: 'PATIENT', roles: [] };
const bob: Caller = { id: 'b0000000-0000-4000-8000-000000000002', type: 'PATIENT', roles: [] };
const receptionist: Caller = {
  id: 'b0000000-0000-4000-8000-000000000003',
  type: 'STAFF',
  roles: ['RECEPTIONIST'],
};

const clinic = {
  id: 'c0000000-0000-4000-8000-000000000001',
  departmentId: 'd0000000-0000-4000-8000-000000000001',
  nameAr: 'عيادة ١',
  nameEn: 'Clinic 1',
  building: 'A',
  floor: '2',
  directionsAr: 'يمين المصعد',
  directionsEn: 'Right of the lift',
};

function appointmentRow(patientId: string) {
  return {
    id: APPT,
    status: 'BOOKED',
    patientId,
    bookedAt: NOW,
    checkedInAt: null,
    startedAt: null,
    completedAt: null,
    patient: { id: patientId, name: 'Test Patient' },
    slot: {
      startsAt: LATER,
      endsAt: new Date(LATER.getTime() + 15 * 60_000),
      doctorId: 'e0000000-0000-4000-8000-000000000001',
      clinicId: clinic.id,
      doctor: { id: 'e0000000-0000-4000-8000-000000000001', name: 'Dr. Test' },
      clinic,
    },
  };
}

function openSlot(holders: { id: string; patientId: string }[] = []) {
  return {
    status: 'OPEN',
    startsAt: LATER,
    clinic: { active: true },
    doctor: { active: true },
    appointments: holders,
  };
}

function setup() {
  const prisma = {
    slot: { findUnique: vi.fn() },
    appointment: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
    },
    staffClinic: { findUnique: vi.fn() },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new AppointmentsService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
  );
  return { prisma, audit, service };
}

async function apiErrorCode(promise: Promise<unknown>): Promise<string> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  return (error as ApiError).code;
}

describe('AppointmentsService.book', () => {
  it('books a free slot and audits it in the same transaction', async () => {
    const { prisma, audit, service } = setup();
    prisma.slot.findUnique.mockResolvedValue(openSlot());
    prisma.appointment.create.mockResolvedValue(appointmentRow(alice.id));

    const result = await service.book(alice, SLOT, NOW);

    expect(result.created).toBe(true);
    expect(result.appointment.id).toBe(APPT);
    expect(prisma.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { patientId: alice.id, slotId: SLOT } }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'appointment.book', outcome: 'SUCCESS' }),
      prisma,
    );
  });

  it('returns the existing booking when the same patient retries', async () => {
    const { prisma, service } = setup();
    prisma.slot.findUnique.mockResolvedValue(openSlot([{ id: APPT, patientId: alice.id }]));
    prisma.appointment.findUniqueOrThrow.mockResolvedValue(appointmentRow(alice.id));

    const result = await service.book(alice, SLOT, NOW);

    expect(result.created).toBe(false);
    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });

  it("refuses a slot someone else holds with SLOT_TAKEN, and audits it", async () => {
    const { prisma, audit, service } = setup();
    prisma.slot.findUnique.mockResolvedValue(openSlot([{ id: APPT, patientId: alice.id }]));

    expect(await apiErrorCode(service.book(bob, SLOT, NOW))).toBe('SLOT_TAKEN');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'FAILED', details: { reason: 'SLOT_TAKEN' } }),
    );
  });

  it('turns a lost race (unique violation) into SLOT_TAKEN', async () => {
    const { prisma, service } = setup();
    prisma.slot.findUnique.mockResolvedValue(openSlot());
    prisma.appointment.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    prisma.appointment.findFirst.mockResolvedValue({ id: APPT, patientId: alice.id });

    expect(await apiErrorCode(service.book(bob, SLOT, NOW))).toBe('SLOT_TAKEN');
  });

  it.each([
    ['blocked', { status: 'BLOCKED' }],
    ['in the past', { startsAt: new Date('2026-11-04T10:00:00Z') }],
    ['in an inactive clinic', { clinic: { active: false } }],
    ['with an inactive doctor', { doctor: { active: false } }],
  ])('refuses a slot %s with SLOT_UNAVAILABLE', async (_name, change) => {
    const { prisma, service } = setup();
    prisma.slot.findUnique.mockResolvedValue({ ...openSlot(), ...change });

    expect(await apiErrorCode(service.book(alice, SLOT, NOW))).toBe('SLOT_UNAVAILABLE');
  });

  it("returns NOT_FOUND for a slot that doesn't exist", async () => {
    const { prisma, service } = setup();
    prisma.slot.findUnique.mockResolvedValue(null);

    expect(await apiErrorCode(service.book(alice, SLOT, NOW))).toBe('NOT_FOUND');
  });
});

describe('AppointmentsService.getOne', () => {
  it("shows a patient their own appointment", async () => {
    const { prisma, service } = setup();
    prisma.appointment.findUnique.mockResolvedValue(appointmentRow(alice.id));

    expect((await service.getOne(alice, APPT)).id).toBe(APPT);
  });

  it("answers NOT_FOUND for another patient's appointment, and audits it", async () => {
    const { prisma, audit, service } = setup();
    prisma.appointment.findUnique.mockResolvedValue(appointmentRow(alice.id));

    expect(await apiErrorCode(service.getOne(bob, APPT))).toBe('NOT_FOUND');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'appointment.read', outcome: 'DENIED' }),
    );
  });

  it("only shows a receptionist their own clinics' appointments", async () => {
    const { prisma, service } = setup();
    prisma.appointment.findUnique.mockResolvedValue(appointmentRow(alice.id));

    prisma.staffClinic.findUnique.mockResolvedValue({ clinicId: clinic.id });
    expect((await service.getOne(receptionist, APPT)).id).toBe(APPT);

    prisma.staffClinic.findUnique.mockResolvedValue(null);
    expect(await apiErrorCode(service.getOne(receptionist, APPT))).toBe('NOT_FOUND');
  });
});

describe('AppointmentsService.listClinicDay', () => {
  it("answers NOT_FOUND for a clinic the receptionist isn't assigned to", async () => {
    const { prisma, service } = setup();
    prisma.staffClinic.findUnique.mockResolvedValue(null);

    expect(await apiErrorCode(service.listClinicDay(receptionist, clinic.id))).toBe('NOT_FOUND');
    expect(prisma.appointment.findMany).not.toHaveBeenCalled();
  });

  it("queries the whole Cairo day, in UTC", async () => {
    const { prisma, service } = setup();
    prisma.staffClinic.findUnique.mockResolvedValue({ clinicId: clinic.id });
    prisma.appointment.findMany.mockResolvedValue([]);

    await service.listClinicDay(receptionist, clinic.id, '2026-11-05');

    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          slot: {
            clinicId: clinic.id,
            startsAt: {
              gte: new Date('2026-11-04T22:00:00Z'),
              lt: new Date('2026-11-05T22:00:00Z'),
            },
          },
        }),
      }),
    );
  });
});

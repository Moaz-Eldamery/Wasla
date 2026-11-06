import { ApiError } from '../../shared/api-error.js';
import type { AuditService } from '../../shared/audit.service.js';
import type { Caller } from '../../shared/caller.js';
import type { PrismaService } from '../../shared/prisma.service.js';
import type { AppointmentsService } from '../appointments/appointments.service.js';
import { QueueService } from './queue.service.js';

// 12:00 in Cairo on 5 November 2026.
const NOW = new Date('2026-11-05T10:00:00Z');
const TODAY_9AM = new Date('2026-11-05T07:00:00Z');
const TOMORROW = new Date('2026-11-06T07:00:00Z');
const APPT = 'a0000000-0000-4000-8000-000000000001';
const CLINIC = 'c0000000-0000-4000-8000-000000000001';

const alice: Caller = { id: 'b0000000-0000-4000-8000-000000000001', type: 'PATIENT', roles: [] };
const bob: Caller = { id: 'b0000000-0000-4000-8000-000000000002', type: 'PATIENT', roles: [] };
const receptionist: Caller = {
  id: 'b0000000-0000-4000-8000-000000000003',
  type: 'STAFF',
  roles: ['RECEPTIONIST'],
};
const doctor: Caller = {
  id: 'b0000000-0000-4000-8000-000000000004',
  type: 'STAFF',
  roles: ['DOCTOR'],
};
const otherDoctor: Caller = {
  id: 'b0000000-0000-4000-8000-000000000005',
  type: 'STAFF',
  roles: ['DOCTOR'],
};

const VIEW = { id: APPT, status: 'CHECKED_IN' };

function setup() {
  const prisma = {
    appointment: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    staffClinic: { findUnique: vi.fn().mockResolvedValue({ clinicId: CLINIC }) },
    $executeRaw: vi.fn().mockResolvedValue(1),
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const appointments = { view: vi.fn().mockResolvedValue(VIEW) };
  const service = new QueueService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    appointments as unknown as AppointmentsService,
  );
  return { prisma, audit, appointments, service };
}

async function apiError(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

describe('QueueService.checkIn', () => {
  const booked = (startsAt = TODAY_9AM) => ({
    status: 'BOOKED',
    slot: { clinicId: CLINIC, startsAt },
  });

  it('checks a booked patient in on the day, and audits it in the same transaction', async () => {
    const { prisma, audit, service } = setup();
    prisma.appointment.findUnique.mockResolvedValue(booked());

    expect(await service.checkIn(receptionist, APPT, NOW)).toBe(VIEW);
    expect(prisma.appointment.updateMany).toHaveBeenCalledWith({
      where: { id: APPT, status: 'BOOKED' },
      data: { checkedInAt: NOW, status: 'CHECKED_IN' },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'appointment.check_in', outcome: 'SUCCESS' }),
      prisma,
    );
  });

  it('still checks in a patient who arrives after their slot ended that day', async () => {
    const { prisma, service } = setup();
    prisma.appointment.findUnique.mockResolvedValue(booked(new Date('2026-11-05T06:00:00Z')));
    await expect(service.checkIn(receptionist, APPT, NOW)).resolves.toBe(VIEW);
  });

  it('refuses another day', async () => {
    const { prisma, service } = setup();
    prisma.appointment.findUnique.mockResolvedValue(booked(TOMORROW));
    expect((await apiError(service.checkIn(receptionist, APPT, NOW))).code).toBe(
      'INVALID_TRANSITION',
    );
    expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
  });

  it('refuses an appointment that is not booked', async () => {
    const { prisma, service } = setup();
    prisma.appointment.findUnique.mockResolvedValue({ ...booked(), status: 'CHECKED_IN' });
    expect((await apiError(service.checkIn(receptionist, APPT, NOW))).code).toBe(
      'INVALID_TRANSITION',
    );
  });

  it('lets only one of two simultaneous check-ins through', async () => {
    const { prisma, service } = setup();
    prisma.appointment.findUnique.mockResolvedValue(booked());
    prisma.appointment.updateMany.mockResolvedValue({ count: 0 });
    expect((await apiError(service.checkIn(receptionist, APPT, NOW))).code).toBe(
      'INVALID_TRANSITION',
    );
  });

  it("answers 'not found' to a receptionist of another clinic, and audits it", async () => {
    const { prisma, audit, service } = setup();
    prisma.appointment.findUnique.mockResolvedValue(booked());
    prisma.staffClinic.findUnique.mockResolvedValue(null);

    expect((await apiError(service.checkIn(receptionist, APPT, NOW))).code).toBe('NOT_FOUND');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'appointment.check_in', outcome: 'DENIED' }),
    );
    expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
  });
});

describe('QueueService.callNext', () => {
  it("calls the earliest patient in the doctor's own line in this clinic", async () => {
    const { prisma, audit, service } = setup();
    prisma.appointment.findFirst
      .mockResolvedValueOnce(null) // nobody in consultation
      .mockResolvedValueOnce({ id: APPT });

    expect(await service.callNext(doctor, CLINIC, NOW)).toBe(VIEW);
    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(prisma.appointment.findFirst).toHaveBeenLastCalledWith({
      where: { status: 'CHECKED_IN', slot: { clinicId: CLINIC, doctorId: doctor.id } },
      orderBy: [{ checkedInAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    expect(prisma.appointment.updateMany).toHaveBeenCalledWith({
      where: { id: APPT, status: 'CHECKED_IN' },
      data: { startedAt: NOW, status: 'IN_CONSULTATION' },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'appointment.call_in', outcome: 'SUCCESS' }),
      prisma,
    );
  });

  it('refuses while the doctor is still with a patient', async () => {
    const { prisma, service } = setup();
    prisma.appointment.findFirst.mockResolvedValueOnce({ id: APPT });
    expect((await apiError(service.callNext(doctor, CLINIC, NOW))).code).toBe(
      'ALREADY_IN_CONSULTATION',
    );
    expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
  });

  it('says QUEUE_EMPTY when nobody is waiting', async () => {
    const { prisma, service } = setup();
    prisma.appointment.findFirst.mockResolvedValue(null);
    expect((await apiError(service.callNext(doctor, CLINIC, NOW))).code).toBe('QUEUE_EMPTY');
  });

  it("answers 'not found' for a clinic the doctor isn't assigned to", async () => {
    const { prisma, audit, service } = setup();
    prisma.staffClinic.findUnique.mockResolvedValue(null);
    expect((await apiError(service.callNext(doctor, CLINIC, NOW))).code).toBe('NOT_FOUND');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'queue.call_next', outcome: 'DENIED' }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('QueueService.complete', () => {
  const visit = (status: string) => ({ status, slot: { doctorId: doctor.id } });

  it("completes the doctor's own visit in consultation", async () => {
    const { prisma, service } = setup();
    prisma.appointment.findUnique.mockResolvedValue(visit('IN_CONSULTATION'));

    expect(await service.complete(doctor, APPT, NOW)).toBe(VIEW);
    expect(prisma.appointment.updateMany).toHaveBeenCalledWith({
      where: { id: APPT, status: 'IN_CONSULTATION' },
      data: { completedAt: NOW, status: 'COMPLETED' },
    });
  });

  it("can't complete a visit that hasn't started", async () => {
    const { prisma, service } = setup();
    prisma.appointment.findUnique.mockResolvedValue(visit('CHECKED_IN'));
    expect((await apiError(service.complete(doctor, APPT, NOW))).code).toBe('INVALID_TRANSITION');
    expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
  });

  it("answers 'not found' to another doctor, and audits it", async () => {
    const { prisma, audit, service } = setup();
    prisma.appointment.findUnique.mockResolvedValue(visit('IN_CONSULTATION'));
    expect((await apiError(service.complete(otherDoctor, APPT, NOW))).code).toBe('NOT_FOUND');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'appointment.complete', outcome: 'DENIED' }),
    );
  });
});

describe('QueueService.getPosition', () => {
  const mine = (status: string) => ({
    id: APPT,
    status,
    patientId: alice.id,
    checkedInAt: status === 'BOOKED' ? null : TODAY_9AM,
    slot: { clinicId: CLINIC, doctorId: doctor.id },
  });

  it("counts who checked in earlier in the same doctor's line", async () => {
    const { prisma, service } = setup();
    prisma.appointment.findUnique.mockResolvedValue(mine('CHECKED_IN'));
    prisma.appointment.count.mockResolvedValue(2);

    expect(await service.getPosition(alice, APPT)).toEqual({
      appointmentId: APPT,
      status: 'CHECKED_IN',
      peopleAhead: 2,
    });
    expect(prisma.appointment.count).toHaveBeenCalledWith({
      where: {
        status: 'CHECKED_IN',
        slot: { clinicId: CLINIC, doctorId: doctor.id },
        OR: [{ checkedInAt: { lt: TODAY_9AM } }, { checkedInAt: TODAY_9AM, id: { lt: APPT } }],
      },
    });
  });

  it('gives no count unless the patient is checked in', async () => {
    const { prisma, service } = setup();
    prisma.appointment.findUnique.mockResolvedValue(mine('BOOKED'));
    expect((await service.getPosition(alice, APPT)).peopleAhead).toBeNull();
    expect(prisma.appointment.count).not.toHaveBeenCalled();
  });

  it("answers 'not found' for someone else's appointment", async () => {
    const { prisma, service } = setup();
    prisma.appointment.findUnique.mockResolvedValue(mine('CHECKED_IN'));
    expect((await apiError(service.getPosition(bob, APPT))).code).toBe('NOT_FOUND');
  });
});

describe('QueueService.getClinicQueue', () => {
  const item = (id: string, startedAt: Date | null) => ({
    id,
    checkedInAt: TODAY_9AM,
    startedAt,
    patient: { name: 'Test Patient' },
    slot: { doctor: { id: doctor.id, name: 'Dr. Test' } },
  });

  it('splits the clinic into waiting and in consultation, labelled by doctor', async () => {
    const { prisma, service } = setup();
    prisma.appointment.findMany
      .mockResolvedValueOnce([item('w1', null)])
      .mockResolvedValueOnce([item('c1', NOW)]);

    const board = await service.getClinicQueue(receptionist, CLINIC);

    expect(board.clinicId).toBe(CLINIC);
    expect(board.waiting).toEqual([
      expect.objectContaining({ appointmentId: 'w1', doctorId: doctor.id, doctorName: 'Dr. Test' }),
    ]);
    expect(board.inConsultation).toEqual([
      expect.objectContaining({ appointmentId: 'c1', startedAt: NOW }),
    ]);
  });

  it("answers 'not found' to staff of another clinic", async () => {
    const { prisma, service } = setup();
    prisma.staffClinic.findUnique.mockResolvedValue(null);
    expect((await apiError(service.getClinicQueue(receptionist, CLINIC))).code).toBe('NOT_FOUND');
  });
});

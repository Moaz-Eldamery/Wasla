import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JourneyStageCode } from '../../generated/prisma/enums.js';
import { ApiError } from '../../shared/api-error.js';
import type { AuditService } from '../../shared/audit.service.js';
import type { Caller } from '../../shared/caller.js';
import type { PrismaService } from '../../shared/prisma.service.js';
import { JourneyService } from './journey.service.js';
import type { JourneyStageRow } from './journey.views.js';

const patientCaller: Caller = {
  id: '11111111-1111-1111-1111-111111111111',
  type: 'PATIENT',
  roles: [],
};

const otherPatient: Caller = {
  id: '99999999-9999-9999-9999-999999999999',
  type: 'PATIENT',
  roles: [],
};

const appointmentClinic = {
  id: '22222222-2222-2222-2222-222222222222',
  departmentId: '33333333-3333-3333-3333-333333333333',
  nameAr: 'عيادة الباطنة ١',
  nameEn: 'Internal Medicine Clinic 1',
  building: 'A',
  floor: '2',
  directionsAr: 'يسار المصعد',
  directionsEn: 'Left of the lift',
};

const labClinic = {
  id: '44444444-4444-4444-4444-444444444444',
  departmentId: '55555555-5555-5555-5555-555555555555',
  nameAr: 'المعمل الرئيسي',
  nameEn: 'Main Laboratory',
  building: 'C',
  floor: 'Ground',
  directionsAr: 'بجوار الصيدلية',
  directionsEn: 'Next to the pharmacy',
};

const STAGES: Record<JourneyStageCode, JourneyStageRow> = {
  BOOKED: {
    code: 'BOOKED',
    sortOrder: 1,
    titleAr: 'تم حجز الموعد',
    titleEn: 'Appointment booked',
    nextStepAr: 'توجه إلى الاستقبال لتسجيل الحضور في يوم موعدك',
    nextStepEn: 'Go to the clinic reception to check in on the day of your appointment',
    location: 'APPOINTMENT_CLINIC',
  },
  CHECKED_IN: {
    code: 'CHECKED_IN',
    sortOrder: 2,
    titleAr: 'تم تسجيل الحضور',
    titleEn: 'Checked in',
    nextStepAr: 'انتظر في منطقة الانتظار حتى ينادي الطبيب اسمك',
    nextStepEn: 'Wait at the clinic waiting area until the doctor calls you',
    location: 'APPOINTMENT_CLINIC',
  },
  WITH_DOCTOR: {
    code: 'WITH_DOCTOR',
    sortOrder: 3,
    titleAr: 'مع الطبيب',
    titleEn: 'With the doctor',
    nextStepAr: 'أنت الآن في الكشف مع الطبيب',
    nextStepEn: 'You are now in consultation with the doctor',
    location: 'APPOINTMENT_CLINIC',
  },
  TEST_ORDERED: {
    code: 'TEST_ORDERED',
    sortOrder: 4,
    titleAr: 'تم طلب فحص',
    titleEn: 'Test ordered',
    nextStepAr: 'توجه إلى عيادة الفحص لإجراء الفحص المطلوب',
    nextStepEn: 'Go to the test clinic to complete the ordered test',
    location: 'TEST_CLINIC',
  },
  RESULT_READY: {
    code: 'RESULT_READY',
    sortOrder: 5,
    titleAr: 'النتيجة جاهزة',
    titleEn: 'Result ready',
    nextStepAr: 'اعتمد الطبيب نتيجة الفحص ويمكنك الاطلاع عليها الآن',
    nextStepEn: 'Your doctor released the test result and you can view it now',
    location: 'APPOINTMENT_CLINIC',
  },
  DONE: {
    code: 'DONE',
    sortOrder: 6,
    titleAr: 'انتهت الزيارة',
    titleEn: 'Visit completed',
    nextStepAr: 'اكتملت زيارتك، نتمنى لك دوام الصحة والعافية',
    nextStepEn: 'Your visit is complete',
    location: 'NONE',
  },
};

describe('JourneyService', () => {
  const findUniqueAppointment = vi.fn();
  const findUniqueStage = vi.fn(({ where }: { where: { code: JourneyStageCode } }) =>
    Promise.resolve(STAGES[where.code] ?? null),
  );
  const recordAudit = vi.fn(() => Promise.resolve());

  let service: JourneyService;

  beforeEach(() => {
    vi.clearAllMocks();
    const prisma = {
      appointment: { findUnique: findUniqueAppointment },
      journeyStage: { findUnique: findUniqueStage },
    } as unknown as PrismaService;
    const audit = { record: recordAudit } as unknown as AuditService;
    service = new JourneyService(prisma, audit);
  });

  it('maps BOOKED, CHECKED_IN, WITH_DOCTOR, TEST_ORDERED, RESULT_READY, and DONE to data-driven stages and locations', async () => {
    const appointmentId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    // 1. BOOKED -> BOOKED at appointment clinic
    findUniqueAppointment.mockResolvedValueOnce({
      id: appointmentId,
      patientId: patientCaller.id,
      status: 'BOOKED',
      slot: { clinic: appointmentClinic },
      testOrders: [],
    });
    const booked = await service.getJourney(patientCaller, appointmentId);
    expect(booked.stage).toBe('BOOKED');
    expect(booked.title).toEqual({
      ar: STAGES.BOOKED.titleAr,
      en: STAGES.BOOKED.titleEn,
    });
    expect(booked.nextStep).toEqual({
      ar: STAGES.BOOKED.nextStepAr,
      en: STAGES.BOOKED.nextStepEn,
    });
    expect(booked.location?.id).toBe(appointmentClinic.id);

    // 2. CHECKED_IN -> CHECKED_IN at appointment clinic
    findUniqueAppointment.mockResolvedValueOnce({
      id: appointmentId,
      patientId: patientCaller.id,
      status: 'CHECKED_IN',
      slot: { clinic: appointmentClinic },
      testOrders: [],
    });
    const checkedIn = await service.getJourney(patientCaller, appointmentId);
    expect(checkedIn.stage).toBe('CHECKED_IN');
    expect(checkedIn.location?.id).toBe(appointmentClinic.id);

    // 3. IN_CONSULTATION (no tests) -> WITH_DOCTOR at appointment clinic
    findUniqueAppointment.mockResolvedValueOnce({
      id: appointmentId,
      patientId: patientCaller.id,
      status: 'IN_CONSULTATION',
      slot: { clinic: appointmentClinic },
      testOrders: [],
    });
    const withDoctor = await service.getJourney(patientCaller, appointmentId);
    expect(withDoctor.stage).toBe('WITH_DOCTOR');
    expect(withDoctor.location?.id).toBe(appointmentClinic.id);

    // 4. IN_CONSULTATION with pending test -> TEST_ORDERED at the lab/radiology clinic
    findUniqueAppointment.mockResolvedValueOnce({
      id: appointmentId,
      patientId: patientCaller.id,
      status: 'IN_CONSULTATION',
      slot: { clinic: appointmentClinic },
      testOrders: [
        {
          id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          status: 'REQUESTED',
          orderedAt: new Date('2026-11-06T08:00:00Z'),
          clinic: labClinic,
        },
      ],
    });
    const testOrdered = await service.getJourney(patientCaller, appointmentId);
    expect(testOrdered.stage).toBe('TEST_ORDERED');
    expect(testOrdered.location?.id).toBe(labClinic.id);
    expect(testOrdered.location?.building).toBe('C');

    // 5. IN_CONSULTATION with released test -> RESULT_READY at appointment clinic
    findUniqueAppointment.mockResolvedValueOnce({
      id: appointmentId,
      patientId: patientCaller.id,
      status: 'IN_CONSULTATION',
      slot: { clinic: appointmentClinic },
      testOrders: [
        {
          id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          status: 'RELEASED',
          orderedAt: new Date('2026-11-06T08:00:00Z'),
          clinic: labClinic,
        },
      ],
    });
    const resultReady = await service.getJourney(patientCaller, appointmentId);
    expect(resultReady.stage).toBe('RESULT_READY');
    expect(resultReady.location?.id).toBe(appointmentClinic.id);

    // 6. COMPLETED (no pending tests) -> DONE with location null
    findUniqueAppointment.mockResolvedValueOnce({
      id: appointmentId,
      patientId: patientCaller.id,
      status: 'COMPLETED',
      slot: { clinic: appointmentClinic },
      testOrders: [],
    });
    const done = await service.getJourney(patientCaller, appointmentId);
    expect(done.stage).toBe('DONE');
    expect(done.location).toBeNull();
  });

  it('sends the patient to the lab only while the test is REQUESTED or IN_PROGRESS, not AWAITING_REVIEW', async () => {
    const appointmentId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const visit = (
      status: 'IN_CONSULTATION' | 'COMPLETED',
      testStatus: 'IN_PROGRESS' | 'AWAITING_REVIEW',
    ) => ({
      id: appointmentId,
      patientId: patientCaller.id,
      status,
      slot: { clinic: appointmentClinic },
      testOrders: [
        {
          id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          status: testStatus,
          orderedAt: new Date('2026-11-06T08:00:00Z'),
          clinic: labClinic,
        },
      ],
    });

    // IN_PROGRESS: still at the lab -> TEST_ORDERED at the lab clinic
    findUniqueAppointment.mockResolvedValueOnce(visit('IN_CONSULTATION', 'IN_PROGRESS'));
    const atLab = await service.getJourney(patientCaller, appointmentId);
    expect(atLab.stage).toBe('TEST_ORDERED');
    expect(atLab.location?.id).toBe(labClinic.id);

    // AWAITING_REVIEW during the visit: the lab is done -> back with the doctor
    findUniqueAppointment.mockResolvedValueOnce(visit('IN_CONSULTATION', 'AWAITING_REVIEW'));
    const backWithDoctor = await service.getJourney(patientCaller, appointmentId);
    expect(backWithDoctor.stage).toBe('WITH_DOCTOR');
    expect(backWithDoctor.location?.id).toBe(appointmentClinic.id);

    // AWAITING_REVIEW after the visit: nowhere to go -> DONE
    findUniqueAppointment.mockResolvedValueOnce(visit('COMPLETED', 'AWAITING_REVIEW'));
    const done = await service.getJourney(patientCaller, appointmentId);
    expect(done.stage).toBe('DONE');
    expect(done.location).toBeNull();
  });

  it("returns 404 NOT_FOUND and audits DENIED when another patient requests the journey", async () => {
    const appointmentId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    findUniqueAppointment.mockResolvedValueOnce({
      id: appointmentId,
      patientId: patientCaller.id,
      status: 'BOOKED',
      slot: { clinic: appointmentClinic },
      testOrders: [],
    });

    await expect(service.getJourney(otherPatient, appointmentId)).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    } satisfies Partial<ApiError>);

    expect(recordAudit).toHaveBeenCalledWith({
      caller: otherPatient,
      action: 'journey.read',
      entityType: 'appointment',
      entityId: appointmentId,
      outcome: 'DENIED',
    });
  });

  it('returns 404 NOT_FOUND when the appointment does not exist', async () => {
    findUniqueAppointment.mockResolvedValueOnce(null);

    await expect(
      service.getJourney(patientCaller, 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
    ).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    } satisfies Partial<ApiError>);
  });
});

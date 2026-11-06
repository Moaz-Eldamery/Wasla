// Patient journey against a real, migrated Postgres. Runs only when both URLs are set:
//   DATABASE_URL       the core's own user (wasla_core), as in production
//   SEED_DATABASE_URL  wasla_migrator, to create the test data the core can't
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { cairoToday, startOfCairoDay } from '../src/shared/cairo-time.js';

const enabled = Boolean(process.env.DATABASE_URL && process.env.SEED_DATABASE_URL);

let phoneCounter = Math.floor(Math.random() * 1e8);
const fakePhone = () => `+2015${String(phoneCounter++).padStart(8, '0').slice(-8)}`;

function as(id: string, type: 'PATIENT' | 'STAFF', roles = '') {
  return { 'X-User-Id': id, 'X-User-Type': type, 'X-User-Roles': roles };
}

describe.skipIf(!enabled)('Patient journey (e2e, real database)', () => {
  let app: INestApplication<App>;
  let seed: PrismaClient;
  let ids: {
    appointmentId: string;
    patientId: string;
    otherPatientId: string;
    doctorId: string;
    receptionistId: string;
    appointmentClinicId: string;
    labClinicId: string;
  };

  beforeAll(async () => {
    seed = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.SEED_DATABASE_URL }),
    });
    const tag = randomUUID().slice(0, 8);

    const clinicalDept = await seed.department.create({
      data: { kind: 'CLINICAL', nameAr: `باطنة ${tag}`, nameEn: `Internal Medicine ${tag}` },
    });
    const labDept = await seed.department.create({
      data: { kind: 'LAB', nameAr: `معمل ${tag}`, nameEn: `Laboratory ${tag}` },
    });

    const appointmentClinic = await seed.clinic.create({
      data: {
        departmentId: clinicalDept.id,
        nameAr: 'عيادة ٣',
        nameEn: 'Clinic 3',
        building: 'A',
        floor: '2',
        directionsAr: 'الدور الثاني، يمين المصعد',
        directionsEn: '2nd floor, right of the lift',
      },
    });
    const labClinic = await seed.clinic.create({
      data: {
        departmentId: labDept.id,
        nameAr: 'معمل المبنى ب',
        nameEn: 'Building B Lab',
        building: 'B',
        floor: 'Ground',
        directionsAr: 'المبنى ب، الدور الأرضي',
        directionsEn: 'Building B, ground floor',
      },
    });

    const doctor = await seed.account.create({
      data: {
        type: 'STAFF',
        name: `Dr. Journey ${tag}`,
        phone: fakePhone(),
        passwordHash: 'fake',
        roles: ['DOCTOR'],
      },
    });
    const receptionist = await seed.account.create({
      data: {
        type: 'STAFF',
        name: `Reception Journey ${tag}`,
        phone: fakePhone(),
        passwordHash: 'fake',
        roles: ['RECEPTIONIST'],
      },
    });
    await seed.staffClinic.createMany({
      data: [
        { staffId: doctor.id, clinicId: appointmentClinic.id },
        { staffId: receptionist.id, clinicId: appointmentClinic.id },
      ],
    });

    const [patient, otherPatient] = await Promise.all(
      [0, 1].map((i) =>
        seed.account.create({
          data: {
            type: 'PATIENT',
            name: `Journey Patient ${i}`,
            phone: fakePhone(),
            passwordHash: 'fake',
            phoneVerifiedAt: new Date(),
          },
        }),
      ),
    );

    const startsAt = startOfCairoDay(cairoToday());
    const slot = await seed.slot.create({
      data: {
        doctorId: doctor.id,
        clinicId: appointmentClinic.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 15 * 60_000),
      },
    });
    const appointment = await seed.appointment.create({
      data: { patientId: patient.id, slotId: slot.id },
    });

    ids = {
      appointmentId: appointment.id,
      patientId: patient.id,
      otherPatientId: otherPatient.id,
      doctorId: doctor.id,
      receptionistId: receptionist.id,
      appointmentClinicId: appointmentClinic.id,
      labClinicId: labClinic.id,
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
  });

  afterAll(async () => {
    await app?.close();
    await seed?.$disconnect();
  });

  const http = () => request(app.getHttpServer());
  const getJourney = (headers = as(ids.patientId, 'PATIENT')) =>
    http().get(`/appointments/${ids.appointmentId}/journey`).set(headers);

  it('refuses staff and other patients (auditing denied access)', async () => {
    await getJourney(as(ids.receptionistId, 'STAFF', 'RECEPTIONIST')).expect(403);
    await getJourney(as(ids.otherPatientId, 'PATIENT')).expect(404);
  });

  it('moves through BOOKED -> CHECKED_IN -> WITH_DOCTOR -> TEST_ORDERED -> RESULT_READY -> DONE from database stage rows', async () => {
    // 1. BOOKED
    const booked = await getJourney().expect(200);
    expect(booked.body.stage).toBe('BOOKED');
    expect(booked.body.location.id).toBe(ids.appointmentClinicId);
    expect(booked.body.title.ar).toBeTruthy();
    expect(booked.body.title.en).toBeTruthy();
    expect(booked.body.nextStep.ar).toBeTruthy();
    expect(booked.body.nextStep.en).toBeTruthy();

    // 2. CHECKED_IN
    await http()
      .post(`/appointments/${ids.appointmentId}/check-in`)
      .set(as(ids.receptionistId, 'STAFF', 'RECEPTIONIST'))
      .expect(200);
    const checkedIn = await getJourney().expect(200);
    expect(checkedIn.body.stage).toBe('CHECKED_IN');
    expect(checkedIn.body.location.id).toBe(ids.appointmentClinicId);

    // 3. WITH_DOCTOR
    await http()
      .post('/doctors/me/queue/call-next')
      .set(as(ids.doctorId, 'STAFF', 'DOCTOR'))
      .send({ clinicId: ids.appointmentClinicId })
      .expect(200);
    const withDoctor = await getJourney().expect(200);
    expect(withDoctor.body.stage).toBe('WITH_DOCTOR');
    expect(withDoctor.body.location.id).toBe(ids.appointmentClinicId);

    // 4. TEST_ORDERED (points to the lab clinic in Building B)
    const testOrder = await seed.testOrder.create({
      data: {
        appointmentId: ids.appointmentId,
        clinicId: ids.labClinicId,
        testName: 'Complete Blood Count',
        status: 'REQUESTED',
        orderedById: ids.doctorId,
      },
    });
    const testOrdered = await getJourney().expect(200);
    expect(testOrdered.body.stage).toBe('TEST_ORDERED');
    expect(testOrdered.body.location.id).toBe(ids.labClinicId);
    expect(testOrdered.body.location.building).toBe('B');

    // 5. RESULT_READY (once the doctor releases the test result)
    await seed.testOrder.update({
      where: { id: testOrder.id },
      data: { status: 'RELEASED', releasedAt: new Date(), releasedById: ids.doctorId },
    });
    const resultReady = await getJourney().expect(200);
    expect(resultReady.body.stage).toBe('RESULT_READY');
    expect(resultReady.body.location.id).toBe(ids.appointmentClinicId);

    // 6. DONE (once the visit is completed, location is null)
    await http()
      .post(`/appointments/${ids.appointmentId}/complete`)
      .set(as(ids.doctorId, 'STAFF', 'DOCTOR'))
      .expect(200);
    const done = await getJourney().expect(200);
    expect(done.body.stage).toBe('DONE');
    expect(done.body.location).toBeNull();
  });
});

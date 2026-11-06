// Check-in and the queue against a real, migrated Postgres. Runs only when both URLs are set:
//   DATABASE_URL       the core's own user (wasla_core), as in production
//   SEED_DATABASE_URL  wasla_migrator, to create the test data the core can't
// Use a throwaway database: the audit log is append-only, so test rows stay.
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { addDays, cairoToday, startOfCairoDay } from '../src/shared/cairo-time.js';

const enabled = Boolean(process.env.DATABASE_URL && process.env.SEED_DATABASE_URL);

let phoneCounter = Math.floor(Math.random() * 1e8);
const fakePhone = () => `+2011${String(phoneCounter++).padStart(8, '0').slice(-8)}`;

function as(id: string, type: 'PATIENT' | 'STAFF', roles = '') {
  return { 'X-User-Id': id, 'X-User-Type': type, 'X-User-Roles': roles };
}

describe.skipIf(!enabled)('Check-in and queue (e2e, real database)', () => {
  let app: INestApplication<App>;
  let seed: PrismaClient;
  let ids: {
    clinic: string;
    doctorA: string;
    doctorB: string;
    receptionist: string;
    otherReceptionist: string;
    patients: string[];
    /** Today: patients 0 and 1 with doctor A, patient 2 with doctor B. */
    appointments: string[];
    /** Patient 0's appointment tomorrow. */
    tomorrow: string;
  };

  beforeAll(async () => {
    seed = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.SEED_DATABASE_URL }),
    });
    const tag = randomUUID().slice(0, 8);

    const staff = (name: string, roles: ('DOCTOR' | 'RECEPTIONIST')[]) =>
      seed.account.create({
        data: { type: 'STAFF', name, phone: fakePhone(), passwordHash: 'fake', roles },
      });
    const department = await seed.department.create({
      data: { kind: 'CLINICAL', nameAr: `قلب ${tag}`, nameEn: `Cardiology ${tag}` },
    });
    const clinic = await seed.clinic.create({
      data: {
        departmentId: department.id,
        nameAr: 'عيادة ٤',
        nameEn: 'Clinic 4',
        building: 'B',
        floor: '1',
        directionsAr: 'يسار المدخل',
        directionsEn: 'Left of the entrance',
      },
    });
    const doctorA = await staff(`Dr. A ${tag}`, ['DOCTOR']);
    const doctorB = await staff(`Dr. B ${tag}`, ['DOCTOR']);
    const receptionist = await staff(`Reception ${tag}`, ['RECEPTIONIST']);
    const otherReceptionist = await staff(`Other reception ${tag}`, ['RECEPTIONIST']);
    await seed.staffClinic.createMany({
      data: [doctorA, doctorB, receptionist].map((s) => ({ staffId: s.id, clinicId: clinic.id })),
    });
    const patients = await Promise.all(
      [0, 1, 2].map((i) =>
        seed.account.create({
          data: {
            type: 'PATIENT',
            name: `Queue Patient ${i}`,
            phone: fakePhone(),
            passwordHash: 'fake',
            phoneVerifiedAt: new Date(),
          },
        }),
      ),
    );

    // Slots early today (Cairo), so they're always today whenever the test runs.
    const today = startOfCairoDay(cairoToday());
    const book = async (doctorId: string, patientId: string, startsAt: Date) => {
      const slot = await seed.slot.create({
        data: {
          doctorId,
          clinicId: clinic.id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 15 * 60_000),
        },
      });
      const appointment = await seed.appointment.create({ data: { patientId, slotId: slot.id } });
      return appointment.id;
    };
    const at = (minutes: number) => new Date(today.getTime() + minutes * 60_000);
    const appointments = [
      await book(doctorA.id, patients[0].id, at(0)),
      await book(doctorA.id, patients[1].id, at(15)),
      await book(doctorB.id, patients[2].id, at(0)),
    ];
    const tomorrow = await book(
      doctorA.id,
      patients[0].id,
      startOfCairoDay(addDays(cairoToday(), 1)),
    );

    ids = {
      clinic: clinic.id,
      doctorA: doctorA.id,
      doctorB: doctorB.id,
      receptionist: receptionist.id,
      otherReceptionist: otherReceptionist.id,
      patients: patients.map((p) => p.id),
      appointments,
      tomorrow,
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // Listen once, so simultaneous requests share one server.
    await app.listen(0);
  });

  afterAll(async () => {
    await app?.close();
    await seed?.$disconnect();
  });

  const http = () => request(app.getHttpServer());
  const patient = (i: number) => as(ids.patients[i], 'PATIENT');
  const reception = () => as(ids.receptionist, 'STAFF', 'RECEPTIONIST');
  const doctorA = () => as(ids.doctorA, 'STAFF', 'DOCTOR');
  const doctorB = () => as(ids.doctorB, 'STAFF', 'DOCTOR');
  const checkIn = (appointmentId: string, headers = reception()) =>
    http().post(`/appointments/${appointmentId}/check-in`).set(headers);
  const callNext = (headers: Record<string, string>) =>
    http().post('/doctors/me/queue/call-next').set(headers).send({ clinicId: ids.clinic });
  const position = (i: number) =>
    http().get(`/appointments/${ids.appointments[i]}/queue-position`).set(patient(i));

  it("refuses check-in from other clinics' staff, patients, and on another day", async () => {
    await checkIn(ids.appointments[0], as(ids.otherReceptionist, 'STAFF', 'RECEPTIONIST')).expect(
      404,
    );
    await checkIn(ids.appointments[0], patient(0)).expect(403);
    const otherDay = await checkIn(ids.tomorrow).expect(409);
    expect(otherDay.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('lets only one of two simultaneous check-ins through', async () => {
    // Patient 1 arrives first, though their slot is later.
    const responses = await Promise.all([
      checkIn(ids.appointments[1]),
      checkIn(ids.appointments[1]),
    ]);
    expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 409]);
    const ok = responses.find((r) => r.status === 200)!;
    expect(ok.body).toMatchObject({ status: 'CHECKED_IN', checkedInAt: expect.any(String) });

    await checkIn(ids.appointments[0]).expect(200);
    await checkIn(ids.appointments[2]).expect(200);
  });

  it("counts people ahead in each doctor's own line", async () => {
    expect((await position(1).expect(200)).body.peopleAhead).toBe(0);
    expect((await position(0).expect(200)).body.peopleAhead).toBe(1);
    // Doctor B's line is separate.
    expect((await position(2).expect(200)).body.peopleAhead).toBe(0);

    await http()
      .get(`/appointments/${ids.appointments[0]}/queue-position`)
      .set(patient(1))
      .expect(404);
  });

  it('shows the clinic board to its staff only', async () => {
    const board = await http().get(`/clinics/${ids.clinic}/queue`).set(reception()).expect(200);
    expect(board.body.waiting.map((q: { appointmentId: string }) => q.appointmentId)).toEqual([
      ids.appointments[1],
      ids.appointments[0],
      ids.appointments[2],
    ]);
    expect(board.body.waiting[2]).toMatchObject({ doctorId: ids.doctorB });
    expect(board.body.inConsultation).toEqual([]);

    await http()
      .get(`/clinics/${ids.clinic}/queue`)
      .set(as(ids.otherReceptionist, 'STAFF', 'RECEPTIONIST'))
      .expect(404);
  });

  it("can't complete a visit that hasn't started", async () => {
    const res = await http()
      .post(`/appointments/${ids.appointments[1]}/complete`)
      .set(doctorA())
      .expect(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('calls in exactly one patient when the doctor presses twice at once', async () => {
    const responses = await Promise.all([callNext(doctorA()), callNext(doctorA())]);
    expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 409]);

    const called = responses.find((r) => r.status === 200)!;
    expect(called.body).toMatchObject({ id: ids.appointments[1], status: 'IN_CONSULTATION' });
    const refused = responses.find((r) => r.status === 409)!;
    expect(refused.body.error.code).toBe('ALREADY_IN_CONSULTATION');

    expect((await position(0).expect(200)).body.peopleAhead).toBe(0);
    expect((await position(1).expect(200)).body.peopleAhead).toBeNull();
  });

  it("lets doctor B call their own patient, but not finish doctor A's visit", async () => {
    const called = await callNext(doctorB()).expect(200);
    expect(called.body.id).toBe(ids.appointments[2]);

    await http().post(`/appointments/${ids.appointments[1]}/complete`).set(doctorB()).expect(404);
  });

  it('completes, calls the next one, and runs out of patients', async () => {
    const done = await http()
      .post(`/appointments/${ids.appointments[1]}/complete`)
      .set(doctorA())
      .expect(200);
    expect(done.body).toMatchObject({ status: 'COMPLETED', completedAt: expect.any(String) });

    expect((await callNext(doctorA()).expect(200)).body.id).toBe(ids.appointments[0]);
    await http().post(`/appointments/${ids.appointments[0]}/complete`).set(doctorA()).expect(200);

    const empty = await callNext(doctorA()).expect(409);
    expect(empty.body.error.code).toBe('QUEUE_EMPTY');
  });

  it('writes every status change to the audit log', async () => {
    const entries = await seed.auditLog.findMany({
      where: { entityType: 'appointment', entityId: { in: ids.appointments }, outcome: 'SUCCESS' },
      select: { action: true },
    });
    const count = (action: string) => entries.filter((e) => e.action === action).length;
    expect(count('appointment.check_in')).toBe(3);
    expect(count('appointment.call_in')).toBe(3);
    expect(count('appointment.complete')).toBe(2);
  });
});

// Booking against a real, migrated Postgres. Runs only when both URLs are set:
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
import { cairoToday } from '../src/shared/cairo-time.js';
import { PrismaService } from '../src/shared/prisma.service.js';

const enabled = Boolean(process.env.DATABASE_URL && process.env.SEED_DATABASE_URL);
const PATIENTS = 10;

let phoneCounter = Math.floor(Math.random() * 1e8);
const fakePhone = () => `+2010${String(phoneCounter++).padStart(8, '0').slice(-8)}`;

function as(id: string, type: 'PATIENT' | 'STAFF', roles = '') {
  return { 'X-User-Id': id, 'X-User-Type': type, 'X-User-Roles': roles };
}

describe.skipIf(!enabled)('Booking (e2e, real database)', () => {
  let app: INestApplication<App>;
  let seed: PrismaClient;
  let ids: {
    department: string;
    clinic: string;
    doctor: string;
    receptionist: string;
    otherReceptionist: string;
    patients: string[];
    slot: string;
    slotStartsAt: Date;
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
      data: { kind: 'CLINICAL', nameAr: `باطنة ${tag}`, nameEn: `Internal ${tag}` },
    });
    const clinic = await seed.clinic.create({
      data: {
        departmentId: department.id,
        nameAr: 'عيادة ٣',
        nameEn: 'Clinic 3',
        building: 'A',
        floor: '2',
        directionsAr: 'يمين المصعد',
        directionsEn: 'Right of the lift',
      },
    });
    const doctor = await staff(`Dr. Test ${tag}`, ['DOCTOR']);
    const receptionist = await staff(`Reception ${tag}`, ['RECEPTIONIST']);
    const otherReceptionist = await staff(`Other reception ${tag}`, ['RECEPTIONIST']);
    await seed.staffClinic.createMany({
      data: [
        { staffId: doctor.id, clinicId: clinic.id },
        { staffId: receptionist.id, clinicId: clinic.id },
      ],
    });
    const patients = await Promise.all(
      Array.from({ length: PATIENTS }, (_, i) =>
        seed.account.create({
          data: {
            type: 'PATIENT',
            name: `Test Patient ${i}`,
            phone: fakePhone(),
            passwordHash: 'fake',
            phoneVerifiedAt: new Date(),
          },
        }),
      ),
    );
    const startsAt = new Date(Date.now() + 2 * 3_600_000);
    const slot = await seed.slot.create({
      data: {
        doctorId: doctor.id,
        clinicId: clinic.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 15 * 60_000),
      },
    });

    ids = {
      department: department.id,
      clinic: clinic.id,
      doctor: doctor.id,
      receptionist: receptionist.id,
      otherReceptionist: otherReceptionist.id,
      patients: patients.map((p) => p.id),
      slot: slot.id,
      slotStartsAt: startsAt,
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

  it('lists the department, its doctor and the free slot', async () => {
    const departments = await http().get('/departments?kind=CLINICAL').set(patient(0)).expect(200);
    expect(departments.body.map((d: { id: string }) => d.id)).toContain(ids.department);

    const doctors = await http()
      .get(`/departments/${ids.department}/doctors`)
      .set(patient(0))
      .expect(200);
    expect(doctors.body).toEqual([expect.objectContaining({ id: ids.doctor })]);

    const slots = await http().get(`/doctors/${ids.doctor}/slots`).set(patient(0)).expect(200);
    expect(slots.body.map((s: { id: string }) => s.id)).toContain(ids.slot);
  });

  let winner: number;
  let appointmentId: string;

  it(`lets exactly one of ${PATIENTS} simultaneous bookings through`, async () => {
    const responses = await Promise.all(
      ids.patients.map((_, i) =>
        http().post('/appointments').set(patient(i)).send({ slotId: ids.slot }),
      ),
    );

    const won = responses.filter((r) => r.status === 201);
    const lost = responses.filter((r) => r.status === 409);
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(PATIENTS - 1);
    for (const r of lost) expect(r.body.error.code).toBe('SLOT_TAKEN');

    winner = responses.findIndex((r) => r.status === 201);
    appointmentId = won[0].body.id;
    expect(won[0].body).toMatchObject({ status: 'BOOKED', clinic: { id: ids.clinic } });
  });

  it('returns the same booking when the winner retries', async () => {
    const retry = await http()
      .post('/appointments')
      .set(patient(winner))
      .send({ slotId: ids.slot })
      .expect(200);
    expect(retry.body.id).toBe(appointmentId);
  });

  it('no longer lists the slot as free', async () => {
    const slots = await http().get(`/doctors/${ids.doctor}/slots`).set(patient(0)).expect(200);
    expect(slots.body.map((s: { id: string }) => s.id)).not.toContain(ids.slot);
  });

  it("shows patients only their own appointments", async () => {
    const mine = await http().get('/me/appointments').set(patient(winner)).expect(200);
    expect(mine.body.map((a: { id: string }) => a.id)).toEqual([appointmentId]);

    await http().get(`/appointments/${appointmentId}`).set(patient(winner)).expect(200);

    const other = (winner + 1) % PATIENTS;
    const res = await http().get(`/appointments/${appointmentId}`).set(patient(other)).expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect((await http().get('/me/appointments').set(patient(other))).body).toEqual([]);
  });

  it("shows a receptionist their clinic's day, and nobody else", async () => {
    const date = cairoToday(ids.slotStartsAt);
    const day = await http()
      .get(`/clinics/${ids.clinic}/appointments?date=${date}`)
      .set(as(ids.receptionist, 'STAFF', 'RECEPTIONIST'))
      .expect(200);
    expect(day.body.map((a: { id: string }) => a.id)).toEqual([appointmentId]);

    await http()
      .get(`/clinics/${ids.clinic}/appointments?date=${date}`)
      .set(as(ids.otherReceptionist, 'STAFF', 'RECEPTIONIST'))
      .expect(404);

    const forbidden = await http()
      .get(`/clinics/${ids.clinic}/appointments`)
      .set(patient(0))
      .expect(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');
  });

  it('refuses requests without identity headers', async () => {
    const res = await http().get('/departments').expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('writes every booking attempt to the audit log', async () => {
    const entries = await seed.auditLog.findMany({
      where: { action: 'appointment.book', actorId: { in: ids.patients } },
      select: { outcome: true },
    });
    expect(entries.filter((e) => e.outcome === 'SUCCESS')).toHaveLength(1);
    expect(entries.filter((e) => e.outcome === 'FAILED')).toHaveLength(PATIENTS - 1);
  });

  it("connects as a user that can't read password hashes or edit the audit log", async () => {
    const core = app.get(PrismaService);
    await expect(core.$queryRaw`SELECT password_hash FROM auth.accounts LIMIT 1`).rejects.toThrow(
      /permission denied/,
    );
    await expect(core.$executeRaw`DELETE FROM core.audit_log`).rejects.toThrow(/permission denied/);
    // Even the table's owner can't change it: the trigger refuses.
    await expect(seed.$executeRaw`UPDATE core.audit_log SET action = 'x'`).rejects.toThrow(
      /append-only/,
    );
  });
});

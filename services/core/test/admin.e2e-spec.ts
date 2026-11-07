// The admin dashboard's core endpoints (KAN-36, KAN-39, KAN-62) and the
// doctor's day list, against a real, migrated Postgres. Runs only when both URLs are set:
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
const fakePhone = () => `+2012${String(phoneCounter++).padStart(8, '0').slice(-8)}`;

function as(id: string, roles: string, type: 'PATIENT' | 'STAFF' = 'STAFF') {
  return { 'X-User-Id': id, 'X-User-Type': type, 'X-User-Roles': roles };
}

describe.skipIf(!enabled)('Admin dashboard and doctor day (e2e, real database)', () => {
  let app: INestApplication<App>;
  let seed: PrismaClient;
  const tag = randomUUID().slice(0, 8);
  let ids: {
    admin: string;
    adminOnly: string;
    doctor: string;
    otherDoctor: string;
    receptionist: string;
    patient: string;
    department: string;
    clinic: string;
    futureSlot: string;
  };
  /** Two days ago in Cairo: one completed visit (12 min wait), one no-show, one cancelled. */
  const pastDay = addDays(cairoToday(), -2);

  beforeAll(async () => {
    seed = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.SEED_DATABASE_URL }),
    });
    const staff = (name: string, roles: ('ADMIN' | 'DOCTOR' | 'RECEPTIONIST')[]) =>
      seed.account.create({
        data: { type: 'STAFF', name: `${name} ${tag}`, email: `${randomUUID()}@e2e.test`, passwordHash: 'fake', roles },
      });
    const admin = await staff('Admin', ['ADMIN']);
    const adminOnly = await staff('Second Admin', ['ADMIN']);
    const doctor = await staff('Dr. Hoda', ['DOCTOR']);
    const otherDoctor = await staff('Dr. Other', ['DOCTOR']);
    const receptionist = await staff('Reception', ['RECEPTIONIST']);
    const patient = await seed.account.create({
      data: { type: 'PATIENT', name: 'Admin E2E Patient', phone: fakePhone(), passwordHash: 'fake', phoneVerifiedAt: new Date() },
    });
    const department = await seed.department.create({
      data: { kind: 'CLINICAL', nameAr: `عيون ${tag}`, nameEn: `Ophthalmology ${tag}` },
    });
    const clinic = await seed.clinic.create({
      data: {
        departmentId: department.id,
        nameAr: 'عيادة العيون',
        nameEn: `Eye Clinic ${tag}`,
        building: 'C',
        floor: '3',
        directionsAr: 'آخر الممر',
        directionsEn: 'End of the corridor',
      },
    });
    await seed.staffClinic.createMany({
      data: [doctor, otherDoctor].map((d) => ({ staffId: d.id, clinicId: clinic.id })),
    });

    const past = startOfCairoDay(pastDay);
    const at = (base: Date, minutes: number) => new Date(base.getTime() + minutes * 60_000);
    const slotAt = (doctorId: string, startsAt: Date) =>
      seed.slot.create({ data: { doctorId, clinicId: clinic.id, startsAt, endsAt: at(startsAt, 15) } });
    const visit = async (startsAt: Date, data: Record<string, unknown>, doctorId = doctor.id) => {
      const slot = await slotAt(doctorId, startsAt);
      return seed.appointment.create({ data: { patientId: patient.id, slotId: slot.id, ...data } });
    };
    const morning = at(past, 9 * 60);
    await visit(morning, {
      status: 'COMPLETED',
      checkedInAt: at(morning, -2),
      startedAt: at(morning, 10),
      completedAt: at(morning, 20),
    });
    await visit(at(morning, 15), { status: 'NO_SHOW', noShowReason: 'did not come' });
    await visit(at(morning, 30), { status: 'CANCELLED', cancelledAt: past });

    // Today: one appointment for each doctor, plus a cancelled one for the first.
    const today = at(startOfCairoDay(cairoToday()), 30);
    await visit(today, {});
    await visit(at(today, 15), { status: 'CANCELLED', cancelledAt: new Date() });
    await visit(at(today, 30), {}, otherDoctor.id);

    const futureSlot = await slotAt(doctor.id, at(startOfCairoDay(addDays(cairoToday(), 3)), 9 * 60));

    ids = {
      admin: admin.id,
      adminOnly: adminOnly.id,
      doctor: doctor.id,
      otherDoctor: otherDoctor.id,
      receptionist: receptionist.id,
      patient: patient.id,
      department: department.id,
      clinic: clinic.id,
      futureSlot: futureSlot.id,
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
  const admin = () => as(ids.admin, 'ADMIN');

  it('lists only the calling doctor’s appointments for the day, leaving out cancelled ones', async () => {
    const day = await http().get('/doctors/me/appointments').set(as(ids.doctor, 'DOCTOR')).expect(200);
    expect(day.body).toHaveLength(1);
    expect(day.body[0].doctor.id).toBe(ids.doctor);

    const past = await http()
      .get('/doctors/me/appointments')
      .query({ date: pastDay })
      .set(as(ids.doctor, 'DOCTOR'))
      .expect(200);
    expect(past.body.map((a: { status: string }) => a.status)).toEqual(['COMPLETED', 'NO_SHOW']);

    await http().get('/doctors/me/appointments').set(as(ids.receptionist, 'RECEPTIONIST')).expect(403);
  });

  it('keeps every admin route to admins', async () => {
    for (const path of ['/admin/departments', `/admin/statistics?from=${pastDay}&to=${pastDay}`, '/admin/audit-log']) {
      const res = await http().get(path).set(as(ids.doctor, 'DOCTOR')).expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('lists departments with clinics and assigned staff, reading only the account columns the core may see', async () => {
    const res = await http().get('/admin/departments').set(admin()).expect(200);
    const dept = res.body.find((d: { id: string }) => d.id === ids.department);
    expect(dept).toMatchObject({ kind: 'CLINICAL', active: true });
    expect(dept.clinics[0].staff.map((s: { id: string }) => s.id).sort()).toEqual([ids.doctor, ids.otherDoctor].sort());
    expect(dept.clinics[0].staff[0]).not.toHaveProperty('email');
    // Clinical departments come before lab and radiology ones.
    const kinds: string[] = res.body.map((d: { kind: string }) => d.kind);
    const firstOther = kinds.findIndex((k) => k !== 'CLINICAL');
    if (firstOther >= 0) expect(kinds.slice(firstOther)).not.toContain('CLINICAL');
  });

  it('takes a deactivated department and its clinics out of booking, and brings them back', async () => {
    const patient = as(ids.patient, '', 'PATIENT');
    const freeSlots = async () =>
      (await http().get(`/doctors/${ids.doctor}/slots`).set(patient).expect(200)).body.map((s: { id: string }) => s.id);
    expect(await freeSlots()).toContain(ids.futureSlot);

    await http().post(`/admin/departments/${ids.department}/deactivate`).set(admin()).expect(200);
    const bookable = await http().get('/departments').set(patient).expect(200);
    expect(bookable.body.map((d: { id: string }) => d.id)).not.toContain(ids.department);
    expect(await freeSlots()).not.toContain(ids.futureSlot);
    const refused = await http().post('/appointments').set(patient).send({ slotId: ids.futureSlot }).expect(409);
    expect(refused.body.error.code).toBe('SLOT_UNAVAILABLE');

    await http().post(`/admin/departments/${ids.department}/reactivate`).set(admin()).expect(200);
    expect(await freeSlots()).toContain(ids.futureSlot);
  });

  it('adds and edits departments and clinics, and assigns and removes staff', async () => {
    const created = await http()
      .post('/admin/departments')
      .set(admin())
      .send({ kind: 'CLINICAL', name: { en: ` Dermatology ${tag} `, ar: 'الجلدية' } })
      .expect(201);
    expect(created.body).toMatchObject({ kind: 'CLINICAL', name: { en: `Dermatology ${tag}` }, active: true, clinics: [] });

    const renamed = await http()
      .put(`/admin/departments/${created.body.id}`)
      .set(admin())
      .send({ name: { en: `Skin ${tag}`, ar: 'الجلدية' } })
      .expect(200);
    expect(renamed.body.name.en).toBe(`Skin ${tag}`);

    const clinic = await http()
      .post(`/admin/departments/${created.body.id}/clinics`)
      .set(admin())
      .send({ name: { en: 'Skin Clinic', ar: 'عيادة الجلدية' }, building: 'D', floor: '2', directions: { en: 'Next to the pharmacy', ar: 'بجوار الصيدلية' } })
      .expect(201);
    const edited = await http()
      .put(`/admin/clinics/${clinic.body.id}`)
      .set(admin())
      .send({ name: { en: 'Skin Clinic', ar: 'عيادة الجلدية' }, building: 'D', floor: '3', directions: { en: 'Next to the pharmacy', ar: 'بجوار الصيدلية' } })
      .expect(200);
    expect(edited.body.floor).toBe('3');

    const assigned = await http().put(`/admin/clinics/${clinic.body.id}/staff/${ids.receptionist}`).set(admin()).expect(200);
    expect(assigned.body.staff.map((s: { id: string }) => s.id)).toEqual([ids.receptionist]);
    // Again is harmless.
    await http().put(`/admin/clinics/${clinic.body.id}/staff/${ids.receptionist}`).set(admin()).expect(200);
    const adminOnly = await http().put(`/admin/clinics/${clinic.body.id}/staff/${ids.adminOnly}`).set(admin()).expect(400);
    expect(adminOnly.body.error.code).toBe('VALIDATION_FAILED');

    const removed = await http().delete(`/admin/clinics/${clinic.body.id}/staff/${ids.receptionist}`).set(admin()).expect(200);
    expect(removed.body.staff).toEqual([]);

    const off = await http().post(`/admin/clinics/${clinic.body.id}/deactivate`).set(admin()).expect(200);
    expect(off.body.active).toBe(false);

    await http().post('/admin/departments').set(admin()).send({ kind: 'CLINICAL', name: { en: '', ar: 'x' } }).expect(400);
    const { name, building, floor, directions } = edited.body;
    await http().put(`/admin/clinics/${randomUUID()}`).set(admin()).send({ name, building, floor, directions }).expect(404);
  });

  it('counts visits, wait and no-shows for a department, with nothing about patients', async () => {
    const res = await http()
      .get('/admin/statistics')
      .query({ from: pastDay, to: addDays(cairoToday(), 1), departmentId: ids.department })
      .set(admin())
      .expect(200);

    expect(res.body.departments).toEqual([{ id: ids.department, name: { ar: `عيون ${tag}`, en: `Ophthalmology ${tag}` } }]);
    expect(res.body.days[0]).toEqual({
      date: pastDay,
      visits: [{ departmentId: ids.department, count: 1 }],
      averageWaitMinutes: 12,
      noShowRate: 0.5,
    });
    // Tomorrow hasn't happened yet.
    expect(res.body.days.at(-1)).toMatchObject({ visits: null, noShowRate: null });
    expect(JSON.stringify(res.body)).not.toContain('Admin E2E Patient');

    await http().get('/admin/statistics').query({ from: pastDay, to: addDays(pastDay, 92) }).set(admin()).expect(400);
  });

  it('searches the audit log by who and action, newest first, with paging', async () => {
    const res = await http()
      .get('/admin/audit-log')
      .query({ who: `Admin ${tag}`, action: 'DEPARTMENT_CHANGED' })
      .set(admin())
      .expect(200);
    expect(res.body.entries.length).toBeGreaterThanOrEqual(4);
    expect(res.body.entries[0]).toMatchObject({
      actor: { id: ids.admin, name: `Admin ${tag}`, type: 'STAFF' },
      action: 'DEPARTMENT_CHANGED',
      outcome: 'SUCCESS',
      entityType: 'DEPARTMENT',
    });
    const entryIds = res.body.entries.map((e: { id: string }) => BigInt(e.id));
    expect([...entryIds].sort((a, b) => (a < b ? 1 : -1))).toEqual(entryIds);

    // The doctor who was refused an admin route shows up as ACCESS_DENIED.
    const denied = await http().get('/admin/audit-log').query({ who: `Dr. Hoda ${tag}`, action: 'ACCESS_DENIED' }).set(admin()).expect(200);
    expect(denied.body.entries.length).toBeGreaterThan(0);

    const all = await http().get('/admin/audit-log').set(admin()).expect(200);
    if (all.body.nextCursor) {
      const next = await http().get('/admin/audit-log').query({ cursor: all.body.nextCursor }).set(admin()).expect(200);
      expect(BigInt(next.body.entries[0].id)).toBeLessThan(BigInt(all.body.entries.at(-1).id));
    }
  });
});

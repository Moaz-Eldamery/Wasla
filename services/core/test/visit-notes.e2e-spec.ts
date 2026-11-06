// Real, migrated Postgres, with the core's restricted DB user. Synthetic data only.
import { Test } from '@nestjs/testing';
import { Logger, type INestApplication } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { AuditService } from '../src/shared/audit.service.js';

const enabled = Boolean(
  process.env.DATABASE_URL && process.env.SEED_DATABASE_URL,
);
const clinicalNotes = 'ملاحظات طبية تجريبية — Synthetic clinical note';
const patientSummary = 'ملخص تجريبي للمريض — Synthetic patient summary';
function as(id: string, role?: string) {
  return {
    'X-User-Id': id,
    'X-User-Type': role ? 'STAFF' : 'PATIENT',
    'X-User-Roles': role ?? '',
  };
}

describe.skipIf(!enabled)('Visit notes (e2e, real database)', () => {
  let app: INestApplication<App>;
  let seed: PrismaClient;
  let ids: {
    visit: string;
    doctor: string;
    otherDoctor: string;
    patient: string;
    otherPatient: string;
    admin: string;
    receptionist: string;
    lab: string;
    clinic: string;
  };
  let version = 0;
  const http = () => request(app.getHttpServer());
  const notesUrl = () => `/appointments/${ids.visit}/notes`;
  const summaryUrl = () => `/appointments/${ids.visit}/summary`;
  const save = (input: Record<string, unknown> = {}) =>
    http()
      .put(notesUrl())
      .set(as(ids.doctor, 'DOCTOR'))
      .send({ baseVersion: version, clinicalNotes, patientSummary, ...input });

  beforeAll(async () => {
    seed = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.SEED_DATABASE_URL,
      }),
    });
    const tag = randomUUID().slice(0, 8);
    const account = (
      name: string,
      roles: ('DOCTOR' | 'ADMIN' | 'RECEPTIONIST' | 'LAB')[] = [],
    ) =>
      seed.account.create({
        data: {
          type: roles.length ? 'STAFF' : 'PATIENT',
          name: `Synthetic ${name} ${tag}`,
          phone: `+${BigInt(
            `0x${randomUUID().replaceAll('-', '').slice(0, 12)}`,
          )
            .toString()
            .padStart(15, '1')}`,
          passwordHash: 'fake',
          roles,
          phoneVerifiedAt: new Date(),
        },
      });
    const [
      doctor,
      otherDoctor,
      patient,
      otherPatient,
      admin,
      receptionist,
      lab,
    ] = await Promise.all([
      account('doctor', ['DOCTOR']),
      account('other doctor', ['DOCTOR']),
      account('patient'),
      account('other patient'),
      account('admin', ['ADMIN']),
      account('receptionist', ['RECEPTIONIST']),
      account('lab', ['LAB']),
    ]);
    const department = await seed.department.create({
      data: {
        kind: 'CLINICAL',
        nameAr: 'قسم تجريبي',
        nameEn: `Synthetic department ${tag}`,
      },
    });
    const clinic = await seed.clinic.create({
      data: {
        departmentId: department.id,
        nameAr: 'عيادة تجريبية',
        nameEn: 'Synthetic clinic',
        building: 'B',
        floor: '1',
        directionsAr: 'الدور الأول',
        directionsEn: 'First floor',
      },
    });
    await seed.staffClinic.createMany({
      data: [
        { staffId: doctor.id, clinicId: clinic.id },
        // Another doctor in the same clinic still must not access this doctor's notes.
        { staffId: otherDoctor.id, clinicId: clinic.id },
      ],
    });
    const now = new Date();
    const slot = await seed.slot.create({
      data: {
        doctorId: doctor.id,
        clinicId: clinic.id,
        startsAt: now,
        endsAt: new Date(now.getTime() + 900_000),
      },
    });
    const visit = await seed.appointment.create({
      data: {
        patientId: patient.id,
        slotId: slot.id,
        status: 'IN_CONSULTATION',
        startedAt: now,
      },
    });
    ids = {
      visit: visit.id,
      doctor: doctor.id,
      otherDoctor: otherDoctor.id,
      patient: patient.id,
      otherPatient: otherPatient.id,
      admin: admin.id,
      receptionist: receptionist.id,
      lab: lab.id,
      clinic: clinic.id,
    };
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
  }, 30_000);

  afterAll(async () => {
    await app?.close();
    await seed?.$disconnect();
  });

  it('requires a session and handles a visit with no saved notes', async () => {
    await http().get(notesUrl()).expect(401);
    await http().get(notesUrl()).set(as(ids.doctor, 'DOCTOR')).expect(404);
    expect(
      (
        await http()
          .get(`${notesUrl()}/versions`)
          .set(as(ids.doctor, 'DOCTOR'))
          .expect(200)
      ).body,
    ).toEqual([]);
    await http().get(summaryUrl()).set(as(ids.patient)).expect(409);
  });

  it('saves the first bilingual snapshot with author and timestamp', async () => {
    const res = await save().expect(200);
    version = res.body.version;
    expect(version).toBe(1);
    expect(res.body).toMatchObject({
      appointmentId: ids.visit,
      clinicalNotes,
      patientSummary,
    });
    expect(res.body.authorName).toContain('Synthetic doctor');
    expect(new Date(res.body.createdAt).toISOString()).toBe(res.body.createdAt);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.body).not.toHaveProperty('authorId');
  });

  it('appends edits while preserving earlier rows and lists history newest first', async () => {
    const old = await seed.visitNoteVersion.findMany({
      where: { appointmentId: ids.visit },
      orderBy: { version: 'asc' },
    });
    const saved = await save({ clinicalNotes: 'Edited synthetic note' }).expect(
      200,
    );
    version = saved.body.version;
    expect(version).toBe(2);
    const latest = await http()
      .get(notesUrl())
      .set(as(ids.doctor, 'DOCTOR'))
      .expect(200);
    expect(latest.body).toEqual(saved.body);
    const history = await http()
      .get(`${notesUrl()}/versions`)
      .set(as(ids.doctor, 'DOCTOR'))
      .expect(200);
    expect(
      history.body.map((note: { version: number }) => note.version),
    ).toEqual([2, 1]);
    expect(history.body[1].clinicalNotes).toBe(clinicalNotes);
    const original = await seed.visitNoteVersion.findUniqueOrThrow({
      where: { id: old[0].id },
    });
    expect(original).toEqual(old[0]);
  });

  it('refuses stale edits and simultaneous saves cannot overwrite each other', async () => {
    const stale = await save({ baseVersion: 0 }).expect(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    const responses = await Promise.all([
      save({ clinicalNotes: 'Concurrent A' }),
      save({ clinicalNotes: 'Concurrent B' }),
    ]);
    expect(responses.map((res) => res.status).sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    version++;
    expect(
      (
        await seed.visitNoteVersion.findMany({
          where: { appointmentId: ids.visit },
          orderBy: { version: 'asc' },
        })
      ).map((note) => note.version),
    ).toEqual([1, 2, 3]);
  });

  it.each([
    { baseVersion: undefined },
    { baseVersion: -1 },
    { baseVersion: 1.5 },
    { baseVersion: '3' },
    { baseVersion: null },
    { clinicalNotes: undefined },
    { clinicalNotes: '' },
    { clinicalNotes: null },
    { clinicalNotes: 123 },
    { clinicalNotes: 'a'.repeat(20001) },
    { patientSummary: 's'.repeat(5001) },
    { patientSummary: 123 },
    { authorId: 'untrusted' },
  ])(
    'validates a malformed save %# without creating a version',
    async (input) => {
      const res = await save(input).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(
        await seed.visitNoteVersion.count({
          where: { appointmentId: ids.visit },
        }),
      ).toBe(version);
    },
  );

  it('accepts the exact 20,000/5,000 character limits', async () => {
    const saved = await save({
      clinicalNotes: 'a'.repeat(20000),
      patientSummary: 's'.repeat(5000),
    }).expect(200);
    version = saved.body.version;
    expect(saved.body.clinicalNotes).toHaveLength(20000);
    expect(saved.body.patientSummary).toHaveLength(5000);
  });

  it('refuses other doctors, patients and non-clinical staff on every notes route', async () => {
    for (const [id, role, status] of [
      [ids.otherDoctor, 'DOCTOR', 404],
      [ids.patient, undefined, 403],
      [ids.admin, 'ADMIN', 403],
      [ids.receptionist, 'RECEPTIONIST', 403],
      [ids.lab, 'LAB', 403],
    ] as const) {
      await http().get(notesUrl()).set(as(id, role)).expect(status);
      await http()
        .get(`${notesUrl()}/versions`)
        .set(as(id, role))
        .expect(status);
      await http()
        .put(notesUrl())
        .set(as(id, role))
        .send({ baseVersion: version, clinicalNotes })
        .expect(status);
    }
    await http()
      .get('/appointments/not-a-uuid/notes')
      .set(as(ids.doctor, 'DOCTOR'))
      .expect(404);
    await http()
      .get(`/appointments/${randomUUID()}/notes`)
      .set(as(ids.doctor, 'DOCTOR'))
      .expect(404);
  });

  it('hides summaries before completion and from every other patient', async () => {
    expect(
      (await http().get(summaryUrl()).set(as(ids.patient)).expect(409)).body
        .error.code,
    ).toBe('NOT_YET_AVAILABLE');
    await http().get(summaryUrl()).set(as(ids.otherPatient)).expect(404);
    for (const [id, role] of [
      [ids.admin, 'ADMIN'],
      [ids.receptionist, 'RECEPTIONIST'],
      [ids.lab, 'LAB'],
      [ids.doctor, 'DOCTOR'],
    ]) {
      await http().get(summaryUrl()).set(as(id, role)).expect(403);
    }
  });

  it('returns only the latest patient summary after completing the visit', async () => {
    const saved = await save().expect(200);
    version = saved.body.version;
    await http()
      .post(`/appointments/${ids.visit}/complete`)
      .set(as(ids.doctor, 'DOCTOR'))
      .expect(200);
    const res = await http().get(summaryUrl()).set(as(ids.patient)).expect(200);
    expect(Object.keys(res.body).sort()).toEqual([
      'appointmentId',
      'completedAt',
      'doctorName',
      'summary',
    ]);
    expect(res.body.summary).toBe(patientSummary);
    expect(JSON.stringify(res.body)).not.toContain(clinicalNotes);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(
      (
        await seed.appointment.findUniqueOrThrow({ where: { id: ids.visit } })
      ).completedAt?.toISOString(),
    ).toBe(res.body.completedAt);
  });

  it('rolls back a save if auditing fails, without leaking clinical text in logs or errors', async () => {
    const before = await seed.visitNoteVersion.findMany({
      where: { appointmentId: ids.visit },
      orderBy: { version: 'asc' },
    });
    const record = vi
      .spyOn(app.get(AuditService), 'record')
      .mockRejectedValueOnce(
        new Error(`Synthetic failing query: ${clinicalNotes}`),
      );
    const logger = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    try {
      const res = await save().expect(500);
      expect(res.body.error.code).toBe('INTERNAL');
      expect(JSON.stringify(res.body)).not.toContain(clinicalNotes);
      expect(JSON.stringify(logger.mock.calls)).not.toContain(clinicalNotes);
      expect(
        await seed.visitNoteVersion.findMany({
          where: { appointmentId: ids.visit },
          orderBy: { version: 'asc' },
        }),
      ).toEqual(before);
    } finally {
      record.mockRestore();
      logger.mockRestore();
    }
  });

  it('fails closed when a read cannot be audited', async () => {
    const record = vi.spyOn(app.get(AuditService), 'record');
    const logger = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    try {
      for (const [url, headers] of [
        [notesUrl(), as(ids.doctor, 'DOCTOR')],
        [summaryUrl(), as(ids.patient)],
      ] as const) {
        record.mockRejectedValueOnce(new Error('Synthetic audit outage'));
        const res = await http().get(url).set(headers).expect(500);
        expect(JSON.stringify(res.body)).not.toContain(clinicalNotes);
        expect(JSON.stringify(res.body)).not.toContain(patientSummary);
      }
    } finally {
      record.mockRestore();
      logger.mockRestore();
    }
  });

  it('uses the latest snapshot after completion and never falls back to an older summary', async () => {
    version = (
      await save({ patientSummary: 'Updated patient summary' }).expect(200)
    ).body.version;
    expect(
      (await http().get(summaryUrl()).set(as(ids.patient)).expect(200)).body
        .summary,
    ).toBe('Updated patient summary');
    version = (await save({ patientSummary: null }).expect(200)).body.version;
    await http().get(summaryUrl()).set(as(ids.patient)).expect(409);
    expect(
      (
        await http()
          .get(`${notesUrl()}/versions`)
          .set(as(ids.doctor, 'DOCTOR'))
          .expect(200)
      ).body,
    ).toHaveLength(version);
  });

  it('audits successful notes reads/edits and refused record access without medical text', async () => {
    const entries = await seed.auditLog.findMany({
      where: { entityId: ids.visit },
      select: { action: true, outcome: true, details: true },
    });
    for (const action of [
      'notes.save',
      'notes.read',
      'notes.versions',
      'notes.summary',
    ]) {
      expect(entries).toContainEqual(
        expect.objectContaining({ action, outcome: 'SUCCESS' }),
      );
    }
    expect(entries).toContainEqual(
      expect.objectContaining({ action: 'notes.save', outcome: 'DENIED' }),
    );
    expect(entries).toContainEqual(
      expect.objectContaining({ action: 'notes.summary', outcome: 'DENIED' }),
    );
    expect(JSON.stringify(entries)).not.toContain(clinicalNotes);
    expect(JSON.stringify(entries)).not.toContain(patientSummary);
    expect(
      entries.filter(
        (entry) => entry.action === 'notes.save' && entry.outcome === 'SUCCESS',
      ),
    ).toHaveLength(version);
  });
});

// Run against a throwaway migrated database and private MinIO (see CI's database job).
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'minio';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { MAX_RESULT_BYTES } from '../src/modules/clinical-care/result-upload.js';
import { FileStorageService } from '../src/shared/file-storage.service.js';
import { AuditService } from '../src/shared/audit.service.js';

const enabled = Boolean(
  process.env.DATABASE_URL &&
  process.env.SEED_DATABASE_URL &&
  process.env.MINIO_ENDPOINT,
);
const pdf = Buffer.from('%PDF-1.7\nSynthetic test result\n%%EOF');
function as(id: string, role?: string) {
  return {
    'X-User-Id': id,
    'X-User-Type': role ? 'STAFF' : 'PATIENT',
    'X-User-Roles': role ?? '',
  };
}

describe.skipIf(!enabled)(
  'Clinical results (e2e, real Postgres and MinIO)',
  () => {
    let app: INestApplication<App>;
    let seed: PrismaClient;
    let minio: Client;
    let ids: {
      visit: string;
      patient: string;
      otherPatient: string;
      doctor: string;
      otherDoctor: string;
      lab: string;
      otherLab: string;
      admin: string;
      receptionist: string;
      clinic: string;
      labClinic: string;
      radiologyClinic: string;
    };
    let testId: string;
    const bucket = process.env.MINIO_RESULTS_BUCKET ?? 'wasla-results';
    const storedKeys = new Set<string>();
    const http = () => request(app.getHttpServer());
    const upload = (
      id: string,
      body = pdf,
      name = 'result.pdf',
      type = 'application/pdf',
    ) =>
      http()
        .post(`/tests/${id}/result`)
        .set(as(ids.lab, 'LAB'))
        .attach('file', body, { filename: name, contentType: type });

    beforeAll(async () => {
      seed = new PrismaClient({
        adapter: new PrismaPg({
          connectionString: process.env.SEED_DATABASE_URL,
        }),
      });
      const endpoint = new URL(process.env.MINIO_ENDPOINT!);
      minio = new Client({
        endPoint: endpoint.hostname,
        port: Number(endpoint.port || 9000),
        useSSL: endpoint.protocol === 'https:',
        accessKey: process.env.MINIO_ACCESS_KEY!,
        secretKey: process.env.MINIO_SECRET_KEY!,
        region: 'us-east-1',
      });
      if (!(await minio.bucketExists(bucket))) await minio.makeBucket(bucket);
      const tag = randomUUID().slice(0, 8);
      const account = (
        name: string,
        roles: ('DOCTOR' | 'LAB' | 'ADMIN' | 'RECEPTIONIST')[] = [],
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
        lab,
        otherLab,
        admin,
        receptionist,
        patient,
        otherPatient,
      ] = await Promise.all([
        account('doctor', ['DOCTOR']),
        account('other doctor', ['DOCTOR']),
        account('lab', ['LAB']),
        account('other lab', ['LAB']),
        account('admin', ['ADMIN']),
        account('receptionist', ['RECEPTIONIST']),
        account('patient'),
        account('other patient'),
      ]);
      const clinic = async (kind: 'CLINICAL' | 'LAB' | 'RADIOLOGY') => {
        const department = await seed.department.create({
          data: { kind, nameAr: kind, nameEn: `${kind} ${tag}` },
        });
        return seed.clinic.create({
          data: {
            departmentId: department.id,
            nameAr: 'عيادة',
            nameEn: 'Synthetic clinic',
            building: 'B',
            floor: '1',
            directionsAr: 'الدور الأول',
            directionsEn: 'First floor',
          },
        });
      };
      const [clinical, labClinic, radiologyClinic] = await Promise.all([
        clinic('CLINICAL'),
        clinic('LAB'),
        clinic('RADIOLOGY'),
      ]);
      await seed.staffClinic.createMany({
        data: [
          { staffId: doctor.id, clinicId: clinical.id },
          { staffId: lab.id, clinicId: labClinic.id },
          { staffId: lab.id, clinicId: radiologyClinic.id },
        ],
      });
      const now = new Date();
      const slot = await seed.slot.create({
        data: {
          doctorId: doctor.id,
          clinicId: clinical.id,
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
        patient: patient.id,
        otherPatient: otherPatient.id,
        doctor: doctor.id,
        otherDoctor: otherDoctor.id,
        lab: lab.id,
        otherLab: otherLab.id,
        admin: admin.id,
        receptionist: receptionist.id,
        clinic: clinical.id,
        labClinic: labClinic.id,
        radiologyClinic: radiologyClinic.id,
      };
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = moduleRef.createNestApplication();
      await app.listen(0);
    }, 30_000);

    afterAll(async () => {
      if (seed && ids) {
        const files = await seed.testResultFile.findMany({
          where: { testOrder: { appointmentId: ids.visit } },
          select: { storageKey: true },
        });
        for (const file of files) storedKeys.add(file.storageKey);
        for (const key of storedKeys) await minio.removeObject(bucket, key);
      }
      await app?.close();
      await seed?.$disconnect();
    });

    async function order(clinicId = ids.labClinic) {
      return http()
        .post(`/appointments/${ids.visit}/tests`)
        .set(as(ids.doctor, 'DOCTOR'))
        .send({
          clinicId,
          testName: 'Synthetic CBC',
          instructions: 'Synthetic instructions',
        });
    }

    async function started() {
      const res = await order();
      expect(res.status).toBe(201);
      await http()
        .post(`/tests/${res.body.id}/start`)
        .set(as(ids.lab, 'LAB'))
        .expect(200);
      return res.body.id as string;
    }

    it('allows the visit doctor to order tests in lab and radiology clinics', async () => {
      const res = await order();
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        status: 'REQUESTED',
        appointmentId: ids.visit,
        clinic: { id: ids.labClinic },
        file: null,
      });
      expect(res.body).not.toHaveProperty('storageKey');
      testId = res.body.id;
      expect((await order(ids.radiologyClinic)).status).toBe(201);
      const list = await http()
        .get(`/appointments/${ids.visit}/tests`)
        .set(as(ids.doctor, 'DOCTOR'))
        .expect(200);
      expect(list.body).toHaveLength(2);
    });

    it('refuses invalid bodies and clinical destinations', async () => {
      expect((await order(ids.clinic)).status).toBe(400);
      for (const testName of ['', ' ', 'x'.repeat(201)]) {
        await http()
          .post(`/appointments/${ids.visit}/tests`)
          .set(as(ids.doctor, 'DOCTOR'))
          .send({ clinicId: ids.labClinic, testName })
          .expect(400);
      }
      await http()
        .post(`/appointments/${ids.visit}/tests`)
        .set(as(ids.otherDoctor, 'DOCTOR'))
        .send({ clinicId: ids.labClinic, testName: 'CBC' })
        .expect(404);
      await http()
        .get(`/appointments/${ids.visit}/tests`)
        .set(as(ids.otherDoctor, 'DOCTOR'))
        .expect(404);
      await seed.appointment.update({
        where: { id: ids.visit },
        data: { status: 'COMPLETED' },
      });
      expect((await order()).status).toBe(409);
      await seed.appointment.update({
        where: { id: ids.visit },
        data: { status: 'IN_CONSULTATION' },
      });
    });

    it('limits the lab list to assigned clinics and validates status filters', async () => {
      const list = await http()
        .get('/lab/tests?status=REQUESTED')
        .set(as(ids.lab, 'LAB'))
        .expect(200);
      expect(list.body.map((test: { id: string }) => test.id)).toContain(
        testId,
      );
      expect(
        (
          await http()
            .get('/lab/tests')
            .set(as(ids.otherLab, 'LAB'))
            .expect(200)
        ).body,
      ).toEqual([]);
      await http()
        .get('/lab/tests?status=BOGUS')
        .set(as(ids.lab, 'LAB'))
        .expect(400);
      await http()
        .post(`/tests/${testId}/start`)
        .set(as(ids.otherLab, 'LAB'))
        .expect(404);
      await http()
        .post(`/tests/${testId}/result`)
        .set(as(ids.otherLab, 'LAB'))
        .attach('file', pdf, {
          filename: 'result.pdf',
          contentType: 'application/pdf',
        })
        .expect(404);
    });

    it('enforces state transitions, including simultaneous start requests', async () => {
      expect((await upload(testId)).status).toBe(409);
      await http()
        .post(`/tests/${testId}/release`)
        .set(as(ids.doctor, 'DOCTOR'))
        .expect(409);
      const responses = await Promise.all(
        [0, 1].map(() =>
          http().post(`/tests/${testId}/start`).set(as(ids.lab, 'LAB')),
        ),
      );
      expect(responses.map((res) => res.status).sort((a, b) => a - b)).toEqual([
        200, 409,
      ]);
    });

    it('validates multipart files, matching file types, and the 10 MB limit', async () => {
      await http()
        .post(`/tests/${testId}/result`)
        .set(as(ids.lab, 'LAB'))
        .expect(400);
      expect((await upload(testId, Buffer.alloc(0))).status).toBe(400);
      expect(
        (await upload(testId, Buffer.from('<html/>'))).body.error.code,
      ).toBe('FILE_TYPE_NOT_ALLOWED');
      expect(
        (await upload(testId, pdf, 'bad.html', 'text/html')).body.error.code,
      ).toBe('FILE_TYPE_NOT_ALLOWED');
      expect(
        (await upload(testId, pdf, 'bad.png', 'image/png')).body.error.code,
      ).toBe('FILE_TYPE_NOT_ALLOWED');
      const oversized = Buffer.alloc(MAX_RESULT_BYTES + 1);
      pdf.copy(oversized);
      const tooBig = await upload(testId, oversized);
      expect(tooBig.status).toBe(413);
      expect(tooBig.body.error.code).toBe('FILE_TOO_LARGE');
      const exact = oversized.subarray(0, MAX_RESULT_BYTES);
      expect((await upload(testId, exact)).status).toBe(200);
    }, 30_000);

    it('keeps uploaded files private and patients waiting until doctor release', async () => {
      const before = await seed.testResultFile.findUniqueOrThrow({
        where: { testOrderId: testId },
      });
      storedKeys.add(before.storageKey);
      const res = await upload(testId);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('AWAITING_REVIEW');
      const stored = await seed.testResultFile.findUniqueOrThrow({
        where: { testOrderId: testId },
      });
      storedKeys.add(stored.storageKey);
      expect(stored.storageKey).not.toBe(before.storageKey);
      await expect(
        minio.statObject(bucket, before.storageKey),
      ).rejects.toThrow();
      const anonymous = await fetch(
        `${process.env.MINIO_ENDPOINT}/${bucket}/${stored.storageKey}`,
      );
      expect(anonymous.status).toBe(403);
      const waiting = await http()
        .get('/me/results')
        .set(as(ids.patient))
        .expect(200);
      const result = waiting.body.find(
        (item: { testId: string }) => item.testId === testId,
      );
      expect(result).toMatchObject({
        status: 'WAITING_FOR_REVIEW',
        file: null,
        releasedAt: null,
      });
      expect(JSON.stringify(result)).not.toContain('storageKey');
      await http()
        .get(`/tests/${testId}/result/file`)
        .set(as(ids.patient))
        .expect(404);
      expect(
        (await http().get('/me/results').set(as(ids.otherPatient)).expect(200))
          .body,
      ).toEqual([]);
    });

    it('allows the ordering doctor and assigned lab to review, refusing every other user', async () => {
      for (const [id, role] of [
        [ids.doctor, 'DOCTOR'],
        [ids.lab, 'LAB'],
      ]) {
        const res = await http()
          .get(`/tests/${testId}/result/file`)
          .set(as(id, role))
          .expect(200);
        expect(res.body).toEqual(pdf);
        expect(res.headers['cache-control']).toBe('private, no-store');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
      }
      for (const [id, role, status] of [
        [ids.otherDoctor, 'DOCTOR', 404],
        [ids.otherLab, 'LAB', 404],
        [ids.admin, 'ADMIN', 403],
        [ids.receptionist, 'RECEPTIONIST', 403],
      ] as const) {
        await http()
          .get(`/tests/${testId}/result/file`)
          .set(as(id, role))
          .expect(status);
      }
      await http().get(`/tests/${testId}/result/file`).expect(401);
      await http()
        .post(`/tests/${testId}/release`)
        .set(as(ids.otherDoctor, 'DOCTOR'))
        .expect(404);
    });

    it('rolls back replacements and release if their audit entry cannot be saved', async () => {
      const before = await seed.testResultFile.findUniqueOrThrow({
        where: { testOrderId: testId },
      });
      const put = vi.spyOn(app.get(FileStorageService), 'put');
      const record = vi
        .spyOn(app.get(AuditService), 'record')
        .mockRejectedValueOnce(new Error('Simulated audit failure'));
      try {
        expect((await upload(testId)).status).toBe(500);
        const attemptedKey = put.mock.calls[0][0];
        expect(
          (
            await seed.testResultFile.findUniqueOrThrow({
              where: { testOrderId: testId },
            })
          ).storageKey,
        ).toBe(before.storageKey);
        await expect(minio.statObject(bucket, attemptedKey)).rejects.toThrow();
        expect((await minio.statObject(bucket, before.storageKey)).size).toBe(
          pdf.length,
        );
        record.mockRejectedValueOnce(new Error('Simulated audit failure'));
        await http()
          .post(`/tests/${testId}/release`)
          .set(as(ids.doctor, 'DOCTOR'))
          .expect(500);
        expect(
          (await seed.testOrder.findUniqueOrThrow({ where: { id: testId } }))
            .status,
        ).toBe('AWAITING_REVIEW');
      } finally {
        record.mockRestore();
        put.mockRestore();
      }
    });

    it('releases only once and lets only the owning patient download', async () => {
      const releases = await Promise.all(
        [0, 1].map(() =>
          http().post(`/tests/${testId}/release`).set(as(ids.doctor, 'DOCTOR')),
        ),
      );
      expect(releases.map((res) => res.status).sort((a, b) => a - b)).toEqual([
        200, 409,
      ]);
      const result = (
        await http().get('/me/results').set(as(ids.patient)).expect(200)
      ).body.find((item: { testId: string }) => item.testId === testId);
      expect(result).toMatchObject({
        status: 'RELEASED',
        file: { fileName: 'result.pdf' },
      });
      expect(
        (
          await http()
            .get(`/tests/${testId}/result/file`)
            .set(as(ids.patient))
            .expect(200)
        ).body,
      ).toEqual(pdf);
      await http()
        .get(`/tests/${testId}/result/file`)
        .set(as(ids.otherPatient))
        .expect(404);
      expect((await upload(testId)).status).toBe(409);
    });

    it('serializes replacement uploads against release and serves the exact released bytes', async () => {
      const id = await started();
      expect((await upload(id)).status).toBe(200);
      const replacement = Buffer.from(
        '%PDF-1.7\nReplacement synthetic result\n%%EOF',
      );
      const [replaced, released] = await Promise.all([
        upload(id, replacement),
        http().post(`/tests/${id}/release`).set(as(ids.doctor, 'DOCTOR')),
      ]);
      expect(released.status).toBe(200);
      expect([200, 409]).toContain(replaced.status);
      const downloaded = await http()
        .get(`/tests/${id}/result/file`)
        .set(as(ids.patient))
        .expect(200);
      expect(downloaded.body).toEqual(
        replaced.status === 200 ? replacement : pdf,
      );
    });

    it.each([
      [
        'image/png',
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        'result.png',
      ],
      ['image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'result.jpg'],
    ])(
      'stores and streams %s with the correct content type',
      async (type, body, name) => {
        const id = await started();
        expect((await upload(id, body, name, type)).status).toBe(200);
        const res = await http()
          .get(`/tests/${id}/result/file`)
          .set(as(ids.lab, 'LAB'))
          .expect(200);
        expect(res.headers['content-type']).toBe(type);
        expect(res.body).toEqual(body);
      },
    );

    it('audits result reads, releases and refused access without clinical content', async () => {
      const entries = await seed.auditLog.findMany({
        where: {
          actorId: {
            in: [ids.patient, ids.doctor, ids.lab, ids.admin, ids.otherPatient],
          },
        },
        select: { action: true, outcome: true, details: true },
      });
      expect(entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'result.read',
            outcome: 'SUCCESS',
          }),
          expect.objectContaining({
            action: 'result.download',
            outcome: 'SUCCESS',
          }),
          expect.objectContaining({
            action: 'result.download',
            outcome: 'DENIED',
          }),
          expect.objectContaining({
            action: 'result.release',
            outcome: 'SUCCESS',
          }),
          expect.objectContaining({
            action: 'access.forbidden',
            outcome: 'DENIED',
          }),
        ]),
      );
      expect(JSON.stringify(entries)).not.toContain('Synthetic CBC');
      expect(JSON.stringify(entries)).not.toContain('Synthetic instructions');
    });
  },
);

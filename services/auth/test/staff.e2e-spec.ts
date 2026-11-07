// Staff accounts (KAN-36) against a real, migrated Postgres. Runs only when both URLs are set:
//   DATABASE_URL       the auth service's own user (wasla_auth), as in production
//   SEED_DATABASE_URL  wasla_migrator, to create the first admin
// Use a throwaway database: the audit log is append-only, so test rows stay.
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule, GLOBAL_PREFIX } from '../src/app.module.js';
import { hashPassword } from '../src/authentication/password.js';
import { PrismaClient } from '../src/generated/prisma/client.js';

const enabled = Boolean(process.env.DATABASE_URL && process.env.SEED_DATABASE_URL);
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe.skipIf(!enabled)('Staff accounts (e2e, real database)', () => {
  let app: INestApplication<App>;
  let seed: PrismaClient;
  let adminId: string;
  let adminToken: string;
  const tag = randomUUID().slice(0, 8);
  const email = (name: string) => `${name}-${tag}@e2e.test`;

  const http = () => request(app.getHttpServer());
  const login = (address: string, password: string) =>
    http().post('/auth/staff/login').send({ email: address, password });

  beforeAll(async () => {
    seed = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.SEED_DATABASE_URL }),
    });
    const admin = await seed.account.create({
      data: {
        type: 'STAFF',
        name: `E2E Admin ${tag}`,
        email: email('admin'),
        roles: ['ADMIN'],
        passwordHash: await hashPassword('admin password'),
      },
    });
    adminId = admin.id;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(GLOBAL_PREFIX);
    await app.listen(0);

    adminToken = (await login(email('admin'), 'admin password').expect(200)).body.token;
  });

  afterAll(async () => {
    await app?.close();
    await seed?.$disconnect();
  });

  it('refuses callers without a session (401) and staff who are not admins (403)', async () => {
    await http().get('/auth/staff').expect(401);
    // No session means 401 even with a bad body: the check runs before validation.
    await http().post('/auth/staff').send({}).expect(401);

    const receptionist = await http()
      .post('/auth/staff')
      .set(bearer(adminToken))
      .send({ name: 'E2E Receptionist', email: email('rec'), roles: ['RECEPTIONIST'] })
      .expect(201);
    const recToken = (await login(email('rec'), receptionist.body.temporaryPassword).expect(200)).body.token;
    const refused = await http().get('/auth/staff').set(bearer(recToken)).expect(403);
    expect(refused.body.error.code).toBe('FORBIDDEN');
  });

  it('adds a doctor who logs in with the one-time password, then changes their roles', async () => {
    const created = await http()
      .post('/auth/staff')
      .set(bearer(adminToken))
      .send({ name: 'Dr. E2E Doctor', email: email('Doctor').toUpperCase(), phone: undefined, roles: ['DOCTOR'] })
      .expect(201);
    expect(created.body.staff).toMatchObject({
      name: 'Dr. E2E Doctor',
      email: email('doctor'),
      phone: null,
      roles: ['DOCTOR'],
      active: true,
    });
    expect(created.body.temporaryPassword).toMatch(/^\w{4}-\w{4}-\w{4}$/);

    const session = await login(email('doctor'), created.body.temporaryPassword).expect(200);
    expect(session.body.user.roles).toEqual(['DOCTOR']);

    const changed = await http()
      .put(`/auth/staff/${created.body.staff.id}/roles`)
      .set(bearer(adminToken))
      .send({ roles: ['ADMIN', 'DOCTOR'] })
      .expect(200);
    expect(changed.body.roles).toEqual(['DOCTOR', 'ADMIN']);
    // The auth check reads roles on every request, so the change applies at once.
    const check = await http().get('/auth/check').set(bearer(session.body.token)).expect(200);
    expect(check.headers['x-user-roles']).toBe('DOCTOR,ADMIN');

    const listed = await http().get('/auth/staff').query({ q: `doctor-${tag}` }).set(bearer(adminToken)).expect(200);
    expect(listed.body.map((s: { id: string }) => s.id)).toEqual([created.body.staff.id]);
  });

  it('logs a deactivated person out at once; reactivating lets them back in', async () => {
    const created = await http()
      .post('/auth/staff')
      .set(bearer(adminToken))
      .send({ name: 'E2E Lab', email: email('lab'), phone: `+2010${String(Date.now()).slice(-8)}`, roles: ['LAB'] })
      .expect(201);
    const id = created.body.staff.id;
    const password = created.body.temporaryPassword;
    const token = (await login(email('lab'), password).expect(200)).body.token;

    const off = await http().post(`/auth/staff/${id}/deactivate`).set(bearer(adminToken)).expect(200);
    expect(off.body.active).toBe(false);
    await http().get('/auth/me').set(bearer(token)).expect(401);
    await http().get('/auth/check').set(bearer(token)).expect(401);
    await login(email('lab'), password).expect(401);
    // Twice is harmless.
    await http().post(`/auth/staff/${id}/deactivate`).set(bearer(adminToken)).expect(200);

    await http().post(`/auth/staff/${id}/reactivate`).set(bearer(adminToken)).expect(200);
    await login(email('lab'), password).expect(200);

    const audit = await seed.auditLog.findMany({
      where: { entityId: id, action: { startsWith: 'staff.' } },
      orderBy: { id: 'asc' },
      select: { action: true, actorId: true, details: true },
    });
    expect(audit.map((a) => a.action)).toEqual([
      'staff.create',
      'staff.deactivate',
      'staff.deactivate',
      'staff.reactivate',
    ]);
    expect(audit[1]).toMatchObject({ actorId: adminId, details: { sessionsRevoked: 1 } });
    // No passwords or names in the log.
    expect(JSON.stringify(audit)).not.toContain(password);
  });

  it("won't let an admin deactivate themselves or drop their own admin role", async () => {
    const self = await http().post(`/auth/staff/${adminId}/deactivate`).set(bearer(adminToken)).expect(403);
    expect(self.body.error.code).toBe('FORBIDDEN');
    await http().put(`/auth/staff/${adminId}/roles`).set(bearer(adminToken)).send({ roles: ['DOCTOR'] }).expect(403);
    await http().get('/auth/me').set(bearer(adminToken)).expect(200);
  });

  it('refuses a work email that already has an account, whatever its case', async () => {
    const taken = await http()
      .post('/auth/staff')
      .set(bearer(adminToken))
      .send({ name: 'Copy', email: email('ADMIN'), roles: ['RECEPTIONIST'] })
      .expect(409);
    expect(taken.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('validates the body and the id', async () => {
    const bad = await http()
      .post('/auth/staff')
      .set(bearer(adminToken))
      .send({ name: 'X', email: 'not-an-email', roles: [] })
      .expect(400);
    expect(bad.body.error.details.map((d: { field: string }) => d.field).sort()).toEqual(['email', 'name', 'roles']);
    await http().post('/auth/staff/not-a-uuid/deactivate').set(bearer(adminToken)).expect(404);
    await http().post(`/auth/staff/${randomUUID()}/deactivate`).set(bearer(adminToken)).expect(404);
  });
});

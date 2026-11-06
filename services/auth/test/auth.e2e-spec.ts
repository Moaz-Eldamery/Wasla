// Sign-up, login and the auth check against a real, migrated Postgres. Runs
// only when both URLs are set:
//   DATABASE_URL       the auth service's own user (wasla_auth), as in production
//   SEED_DATABASE_URL  wasla_migrator, to create staff and read the audit log
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
import { PrismaService } from '../src/prisma.service.js';

const enabled = Boolean(process.env.DATABASE_URL && process.env.SEED_DATABASE_URL);

let phoneCounter = Math.floor(Math.random() * 1e8);
const fakePhone = () => `+2011${String(phoneCounter++).padStart(8, '0').slice(-8)}`;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe.skipIf(!enabled)('Auth (e2e, real database)', () => {
  let app: INestApplication<App>;
  let seed: PrismaClient;

  beforeAll(async () => {
    seed = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.SEED_DATABASE_URL }),
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(GLOBAL_PREFIX);
    await app.listen(0);
  });

  afterAll(async () => {
    await app?.close();
    await seed?.$disconnect();
  });

  const http = () => request(app.getHttpServer());
  const register = (phone: string, name = 'Test Patient', password = 'a long password') =>
    http().post('/auth/register').send({ name, phone, password });

  it('signs a patient up, verifies the phone, logs in, checks and logs out', async () => {
    const phone = fakePhone();

    const signUp = await register(phone).expect(201);
    expect(signUp.body.simulatedCode).toMatch(/^\d{6}$/);

    const early = await http()
      .post('/auth/login')
      .send({ phone, password: 'a long password' })
      .expect(403);
    expect(early.body.error.code).toBe('PHONE_NOT_VERIFIED');

    const wrongCode = signUp.body.simulatedCode === '000000' ? '111111' : '000000';
    const wrong = await http().post('/auth/verify-phone').send({ phone, code: wrongCode }).expect(400);
    expect(wrong.body.error.code).toBe('CODE_INVALID');

    await http()
      .post('/auth/verify-phone')
      .send({ phone, code: signUp.body.simulatedCode })
      .expect(204);

    const badPassword = await http()
      .post('/auth/login')
      .send({ phone, password: 'not the password' })
      .expect(401);
    expect(badPassword.body.error.code).toBe('INVALID_CREDENTIALS');

    const login = await http()
      .post('/auth/login')
      .send({ phone, password: 'a long password' })
      .expect(200);
    const { token, user } = login.body;
    expect(user).toMatchObject({ type: 'PATIENT', phone, email: null, roles: [] });
    expect(user).not.toHaveProperty('passwordHash');

    const me = await http().get('/auth/me').set(bearer(token)).expect(200);
    expect(me.body.id).toBe(user.id);

    const check = await http().get('/auth/check').set(bearer(token)).expect(200);
    expect(check.headers['x-user-id']).toBe(user.id);
    expect(check.headers['x-user-type']).toBe('PATIENT');
    expect(check.headers['x-user-roles']).toBe('');

    await http().post('/auth/logout').set(bearer(token)).expect(204);
    await http().get('/auth/check').set(bearer(token)).expect(401);
    await http().get('/auth/me').set(bearer(token)).expect(401);

    const events = await seed.auditLog.findMany({
      where: { actorId: user.id },
      select: { action: true, outcome: true },
      orderBy: { id: 'asc' },
    });
    expect(events).toEqual([
      { action: 'auth.register', outcome: 'SUCCESS' },
      { action: 'auth.login', outcome: 'DENIED' },
      { action: 'auth.verify_phone', outcome: 'FAILED' },
      { action: 'auth.verify_phone', outcome: 'SUCCESS' },
      { action: 'auth.login', outcome: 'FAILED' },
      { action: 'auth.login', outcome: 'SUCCESS' },
      { action: 'auth.logout', outcome: 'SUCCESS' },
    ]);
  });

  it('starts an unverified sign-up over, but refuses a verified number', async () => {
    const phone = fakePhone();
    await register(phone, 'First Name').expect(201);
    const again = await register(phone, 'Second Name').expect(201);

    const account = await seed.account.findUniqueOrThrow({ where: { phone } });
    expect(account.name).toBe('Second Name');

    await http()
      .post('/auth/verify-phone')
      .send({ phone, code: again.body.simulatedCode })
      .expect(204);
    const taken = await register(phone).expect(409);
    expect(taken.body.error.code).toBe('PHONE_TAKEN');
  });

  it('sends at most 3 codes per number per hour', async () => {
    const phone = fakePhone();
    await register(phone).expect(201);
    await http().post('/auth/resend-code').send({ phone }).expect(202);
    await http().post('/auth/resend-code').send({ phone }).expect(202);

    const fourth = await http().post('/auth/resend-code').send({ phone }).expect(429);
    expect(fourth.body.error.code).toBe('RATE_LIMITED');
    expect(Number(fourth.headers['retry-after'])).toBeGreaterThan(0);
  });

  it("doesn't reveal unknown numbers when resending", async () => {
    const res = await http().post('/auth/resend-code').send({ phone: fakePhone() }).expect(202);
    expect(res.body).not.toHaveProperty('simulatedCode');
  });

  it('logs staff in by work email with their roles, and out at once when deactivated', async () => {
    const email = `dr.test.${randomUUID().slice(0, 8)}@hospital.test`;
    const staff = await seed.account.create({
      data: {
        type: 'STAFF',
        name: 'Dr. Test',
        email,
        passwordHash: await hashPassword('staff password'),
        roles: ['DOCTOR', 'RECEPTIONIST'],
      },
    });

    const login = await http()
      .post('/auth/staff/login')
      .send({ email: email.toUpperCase(), password: 'staff password' })
      .expect(200);
    expect(login.body.user).toMatchObject({ type: 'STAFF', email, phone: null });
    const check = await http().get('/auth/check').set(bearer(login.body.token)).expect(200);
    expect(check.headers['x-user-type']).toBe('STAFF');
    expect(check.headers['x-user-roles']).toBe('DOCTOR,RECEPTIONIST');

    await seed.account.update({ where: { id: staff.id }, data: { active: false } });
    await http().get('/auth/check').set(bearer(login.body.token)).expect(401);
    await http().post('/auth/staff/login').send({ email, password: 'staff password' }).expect(401);
  });

  it("keeps the two logins apart: a staff member's phone doesn't log in to the app", async () => {
    const phone = fakePhone();
    const staff = await seed.account.create({
      data: {
        type: 'STAFF',
        name: 'Reception Test',
        phone,
        email: `reception.${randomUUID().slice(0, 8)}@hospital.test`,
        passwordHash: await hashPassword('staff password'),
        roles: ['RECEPTIONIST'],
      },
    });

    const res = await http()
      .post('/auth/login')
      .send({ phone, password: 'staff password' })
      .expect(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    const denied = await seed.auditLog.findFirstOrThrow({
      where: { actorId: staff.id, action: 'auth.login' },
      select: { outcome: true, details: true },
    });
    expect(denied).toEqual({ outcome: 'DENIED', details: { reason: 'wrong_app' } });
  });

  it('requires a phone for patients and an email for staff, in the database itself', async () => {
    const passwordHash = 'fake';
    await expect(
      seed.account.create({ data: { type: 'STAFF', name: 'No Email', phone: fakePhone(), passwordHash } }),
    ).rejects.toThrow(/accounts_login_identifier/);
    await expect(
      seed.account.create({
        data: { type: 'PATIENT', name: 'Has Email', phone: fakePhone(), email: `p.${randomUUID()}@x.test`, passwordHash },
      }),
    ).rejects.toThrow(/accounts_login_identifier/);
    await expect(
      seed.account.create({
        data: { type: 'STAFF', name: 'Caps', email: `Caps.${randomUUID()}@x.test`, passwordHash },
      }),
    ).rejects.toThrow(/accounts_email_lowercase/);
  });

  it('rejects bad input in the contract error format', async () => {
    const res = await http()
      .post('/auth/register')
      .send({ name: 'X', phone: '0100', password: 'short' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details.map((d: { field: string }) => d.field).sort()).toEqual([
      'name',
      'password',
      'phone',
    ]);
  });

  it('connects as a user that can only insert into the audit log, and sees no core tables', async () => {
    const db = app.get(PrismaService);
    await expect(db.$queryRaw`SELECT id FROM core.audit_log LIMIT 1`).rejects.toThrow(
      /permission denied/,
    );
    await expect(db.$queryRaw`SELECT id FROM core.appointments LIMIT 1`).rejects.toThrow(
      /permission denied/,
    );
  });
});

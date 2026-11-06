import type { AuditService } from '../audit.service.js';
import type { PrismaService } from '../prisma.service.js';
import { AuthenticationService } from './authentication.service.js';
import type { OtpService } from './otp.service.js';
import { hashPassword } from './password.js';
import type { SessionService } from './session.service.js';

const PASSWORD = 'correct horse battery';

async function account(change: object = {}) {
  return {
    id: 'acc-1',
    type: 'PATIENT',
    name: 'Test Patient',
    phone: '+201000000001',
    email: null,
    roles: [],
    active: true,
    passwordHash: await hashPassword(PASSWORD),
    phoneVerifiedAt: new Date(),
    ...change,
  };
}

function setup(found: object | null) {
  const prisma = {
    account: {
      findUnique: vi.fn().mockResolvedValue(found),
      findFirst: vi.fn().mockResolvedValue(found),
      update: vi.fn().mockResolvedValue({ id: 'acc-1' }),
    },
  };
  const sessions = {
    create: vi.fn().mockResolvedValue({ token: 't', expiresAt: new Date() }),
  };
  const otp = { verify: vi.fn(), send: vi.fn() };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new AuthenticationService(
    prisma as unknown as PrismaService,
    sessions as unknown as SessionService,
    otp as unknown as OtpService,
    audit as unknown as AuditService,
  );
  return { prisma, sessions, otp, audit, service };
}

describe('AuthenticationService.login', () => {
  it('logs in with the right password, without returning the hash', async () => {
    const { service, sessions, audit } = setup(await account());

    const result = await service.login('+201000000001', PASSWORD);

    expect(result.token).toBe('t');
    expect(result.user).toEqual({
      id: 'acc-1',
      type: 'PATIENT',
      name: 'Test Patient',
      phone: '+201000000001',
      email: null,
      roles: [],
    });
    expect(sessions.create).toHaveBeenCalledWith('acc-1');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'SUCCESS' }));
  });

  it.each([
    ['an unknown phone', null, PASSWORD, 'unknown_phone'],
    ['a wrong password', 'account', 'wrong password', 'wrong_password'],
    ['an inactive account', 'inactive', PASSWORD, 'inactive'],
  ])('gives the same answer for %s, and audits why', async (_name, kind, password, reason) => {
    const found =
      kind === null ? null : await account(kind === 'inactive' ? { active: false } : {});
    const { service, sessions, audit } = setup(found);

    await expect(service.login('+201000000001', password)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(sessions.create).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.login', details: { reason } }),
    );
  });

  it('asks unverified patients to confirm their phone first', async () => {
    const { service, sessions } = setup(await account({ phoneVerifiedAt: null }));

    await expect(service.login('+201000000001', PASSWORD)).rejects.toMatchObject({
      code: 'PHONE_NOT_VERIFIED',
    });
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it("doesn't let staff log in with a phone number (that's the patient app)", async () => {
    const { service, sessions, audit } = setup(
      await account({ type: 'STAFF', roles: ['DOCTOR'], email: 'dr@hospital.test' }),
    );

    await expect(service.login('+201000000001', PASSWORD)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(sessions.create).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'DENIED', details: { reason: 'wrong_app' } }),
    );
  });
});

describe('AuthenticationService.staffLogin', () => {
  const staff = (change: object = {}) =>
    account({
      type: 'STAFF',
      name: 'Dr. Test',
      phone: null,
      email: 'dr.test@hospital.test',
      roles: ['DOCTOR'],
      phoneVerifiedAt: null,
      ...change,
    });

  it('logs staff in with their work email, whatever its case, without a phone', async () => {
    const { service, prisma, sessions } = setup(await staff());

    const result = await service.staffLogin('  Dr.Test@Hospital.TEST ', PASSWORD);

    expect(prisma.account.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'dr.test@hospital.test' } }),
    );
    expect(result.user).toEqual({
      id: 'acc-1',
      type: 'STAFF',
      name: 'Dr. Test',
      phone: null,
      email: 'dr.test@hospital.test',
      roles: ['DOCTOR'],
    });
    expect(sessions.create).toHaveBeenCalledWith('acc-1');
  });

  it.each([
    ['an unknown email', null, PASSWORD, 'unknown_email'],
    ['a wrong password', {}, 'wrong password', 'wrong_password'],
    ['an inactive account', { active: false }, PASSWORD, 'inactive'],
  ])('gives the same answer for %s, and audits why', async (_name, change, password, reason) => {
    const { service, sessions, audit } = setup(change === null ? null : await staff(change));

    const error = await service.staffLogin('dr.test@hospital.test', password).catch((e) => e);
    expect(error.getResponse()).toEqual({
      error: { code: 'INVALID_CREDENTIALS', message: 'Wrong email or password.' },
    });
    expect(sessions.create).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.login', details: { reason } }),
    );
  });
});

describe('AuthenticationService.verifyPhone', () => {
  it('marks the phone verified when the code is right', async () => {
    const { service, prisma, otp } = setup({ id: 'acc-1', type: 'PATIENT', phone: '+201000000001' });

    await service.verifyPhone('+201000000001', '123456');

    expect(otp.verify).toHaveBeenCalledWith('acc-1', '123456');
    expect(prisma.account.update).toHaveBeenCalled();
  });

  it("doesn't reveal whether a number is registered", async () => {
    const { service, otp } = setup(null);

    await expect(service.verifyPhone('+201000000001', '123456')).rejects.toMatchObject({
      code: 'CODE_INVALID',
    });
    expect(otp.verify).not.toHaveBeenCalled();
  });
});

describe('AuthenticationService.resendCode', () => {
  it('sends no code for unknown or verified numbers, but answers the same way', async () => {
    const { service, otp } = setup(null);

    const result = await service.resendCode('+201000000001');

    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result).not.toHaveProperty('simulatedCode');
    expect(otp.send).not.toHaveBeenCalled();
  });
});

import type { AuditService } from '../audit.service.js';
import type { OtpService } from '../authentication/otp.service.js';
import { verifyPassword } from '../authentication/password.js';
import type { PrismaService } from '../prisma.service.js';
import { IdentityService } from './identity.service.js';

const PHONE = '+201000000001';

function setup(existing: object | null) {
  const saved = { id: 'acc-1', phone: PHONE };
  const prisma = {
    account: {
      findUnique: vi.fn().mockResolvedValue(existing),
      create: vi.fn().mockResolvedValue(saved),
      update: vi.fn().mockResolvedValue(saved),
    },
  };
  const otp = { send: vi.fn().mockResolvedValue({ expiresAt: new Date(), simulatedCode: '123456' }) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new IdentityService(
    prisma as unknown as PrismaService,
    otp as unknown as OtpService,
    audit as unknown as AuditService,
  );
  return { prisma, otp, service };
}

describe('IdentityService.registerPatient', () => {
  it('creates an unverified patient with a hashed password and sends a code', async () => {
    const { prisma, otp, service } = setup(null);

    const sent = await service.registerPatient('Test Patient', PHONE, 'a long password');

    const data = prisma.account.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ type: 'PATIENT', name: 'Test Patient', phone: PHONE });
    expect(data.passwordHash).not.toContain('a long password');
    expect(await verifyPassword(data.passwordHash, 'a long password')).toBe(true);
    expect(otp.send).toHaveBeenCalledWith({ id: 'acc-1', phone: PHONE });
    expect(sent.simulatedCode).toBe('123456');
  });

  it('starts over for a number whose sign-up was never verified', async () => {
    const { prisma, service } = setup({ id: 'acc-1', type: 'PATIENT', phoneVerifiedAt: null });

    await service.registerPatient('New Name', PHONE, 'a new password');

    expect(prisma.account.create).not.toHaveBeenCalled();
    expect(prisma.account.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'New Name' }) }),
    );
  });

  it.each([
    ['a verified patient', { id: 'acc-1', type: 'PATIENT', phoneVerifiedAt: new Date() }],
    ['a staff member', { id: 'acc-1', type: 'STAFF', phoneVerifiedAt: null }],
  ])("refuses a number that belongs to %s", async (_name, existing) => {
    const { prisma, otp, service } = setup(existing);

    await expect(service.registerPatient('X Y', PHONE, 'a long password')).rejects.toMatchObject({
      code: 'PHONE_TAKEN',
    });
    expect(prisma.account.update).not.toHaveBeenCalled();
    expect(otp.send).not.toHaveBeenCalled();
  });
});

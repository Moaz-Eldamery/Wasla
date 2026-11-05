import { createHash } from 'node:crypto';
import type { PrismaService } from '../prisma.service.js';
import { CODE_TTL_MS, MAX_CODES_PER_HOUR, MAX_WRONG_GUESSES, OtpService } from './otp.service.js';

const NOW = new Date('2026-11-05T10:00:00Z');
const account = { id: 'acc-1', phone: '+201000000001' };
const sha = (code: string) => createHash('sha256').update(code).digest('hex');

function setup() {
  const prisma = {
    otpCode: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: 'otp-1' }),
      update: vi.fn().mockResolvedValue({ id: 'otp-1' }),
    },
  };
  return { prisma, otp: new OtpService(prisma as unknown as PrismaService) };
}

function storedCode(code: string, change: object = {}) {
  return {
    id: 'otp-1',
    codeHash: sha(code),
    attempts: 0,
    expiresAt: new Date(NOW.getTime() + 60_000),
    ...change,
  };
}

describe('OtpService.send', () => {
  it('stores only a hash of a fresh 6-digit code that lasts 10 minutes', async () => {
    const { prisma, otp } = setup();

    const sent = await otp.send(account, NOW);

    expect(sent.simulatedCode).toMatch(/^\d{6}$/);
    expect(sent.expiresAt).toEqual(new Date(NOW.getTime() + CODE_TTL_MS));
    const data = prisma.otpCode.create.mock.calls[0][0].data;
    expect(data.codeHash).toBe(sha(sent.simulatedCode));
    expect(JSON.stringify(data)).not.toContain(`"${sent.simulatedCode}"`);
  });

  it(`refuses a ${MAX_CODES_PER_HOUR + 1}th code within an hour, with Retry-After`, async () => {
    const { prisma, otp } = setup();
    prisma.otpCode.findMany.mockResolvedValue(
      Array.from({ length: MAX_CODES_PER_HOUR }, (_, i) => ({
        createdAt: new Date(NOW.getTime() - (50 - i) * 60_000),
      })),
    );

    await expect(otp.send(account, NOW)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryAfterSeconds: 10 * 60, // the oldest code was 50 minutes ago
    });
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
  });
});

describe('OtpService.verify', () => {
  it('accepts the right code once and marks it used', async () => {
    const { prisma, otp } = setup();
    prisma.otpCode.findFirst.mockResolvedValue(storedCode('123456'));

    await otp.verify(account.id, '123456', NOW);

    expect(prisma.otpCode.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { consumedAt: NOW } }),
    );
  });

  it('counts a wrong guess', async () => {
    const { prisma, otp } = setup();
    prisma.otpCode.findFirst.mockResolvedValue(storedCode('123456'));

    await expect(otp.verify(account.id, '000000', NOW)).rejects.toMatchObject({
      code: 'CODE_INVALID',
    });
    expect(prisma.otpCode.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { attempts: { increment: 1 } } }),
    );
  });

  it.each([
    ['there is no code', null],
    ['it expired', storedCode('123456', { expiresAt: NOW })],
    ['it had too many wrong guesses', storedCode('123456', { attempts: MAX_WRONG_GUESSES })],
  ])('needs a new code when %s', async (_name, stored) => {
    const { prisma, otp } = setup();
    prisma.otpCode.findFirst.mockResolvedValue(stored);

    await expect(otp.verify(account.id, '123456', NOW)).rejects.toMatchObject({
      code: 'CODE_EXPIRED',
    });
  });
});

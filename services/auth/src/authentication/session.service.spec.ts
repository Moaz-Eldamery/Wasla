import type { Request } from 'express';
import type { PrismaService } from '../prisma.service.js';
import { bearerToken, SESSION_TTL_MS, SessionService } from './session.service.js';

const NOW = new Date('2026-11-05T10:00:00Z');
const TOKEN = 'b'.repeat(43);
const account = {
  id: 'acc-1',
  type: 'PATIENT',
  name: 'Test Patient',
  phone: '+201000000001',
  roles: [],
  active: true,
};

function setup(session: object | null) {
  const prisma = {
    session: {
      create: vi.fn().mockResolvedValue({ id: 's1' }),
      findUnique: vi.fn().mockResolvedValue(session),
      update: vi.fn().mockResolvedValue({ id: 's1' }),
    },
  };
  return { prisma, sessions: new SessionService(prisma as unknown as PrismaService) };
}

const live = (change: object = {}) => ({
  id: 's1',
  expiresAt: new Date(NOW.getTime() + 60_000),
  revokedAt: null,
  lastSeenAt: NOW,
  account,
  ...change,
});

describe('bearerToken', () => {
  const req = (authorization?: string) => ({ headers: { authorization } }) as Request;

  it('reads a bearer token', () => {
    expect(bearerToken(req(`Bearer ${TOKEN}`))).toBe(TOKEN);
  });

  it.each([undefined, '', TOKEN, `Basic ${TOKEN}`, 'Bearer short', `Bearer ${TOKEN} extra`])(
    'ignores %j',
    (header) => {
      expect(bearerToken(req(header))).toBeNull();
    },
  );
});

describe('SessionService', () => {
  it('creates a 7-day session and stores only the token hash', async () => {
    const { prisma, sessions } = setup(null);

    const { token, expiresAt } = await sessions.create('acc-1', NOW);

    expect(expiresAt).toEqual(new Date(NOW.getTime() + SESSION_TTL_MS));
    const data = prisma.session.create.mock.calls[0][0].data;
    expect(data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(data.tokenHash).not.toBe(token);
  });

  it('returns the user of a live session, without the active flag', async () => {
    const { sessions } = setup(live());
    const { active: _active, ...user } = account;
    expect(await sessions.validate(TOKEN, NOW)).toEqual(user);
  });

  it.each([
    ['no token', null, live()],
    ['an unknown token', TOKEN, null],
    ['an expired session', TOKEN, live({ expiresAt: NOW })],
    ['a revoked session', TOKEN, live({ revokedAt: NOW })],
    ['a deactivated account', TOKEN, live({ account: { ...account, active: false } })],
  ])('rejects %s', async (_name, token, session) => {
    const { sessions } = setup(session);
    expect(await sessions.validate(token, NOW)).toBeNull();
  });

  it('updates last_seen_at only when it is more than a minute old', async () => {
    const fresh = setup(live({ lastSeenAt: new Date(NOW.getTime() - 30_000) }));
    await fresh.sessions.validate(TOKEN, NOW);
    expect(fresh.prisma.session.update).not.toHaveBeenCalled();

    const stale = setup(live({ lastSeenAt: new Date(NOW.getTime() - 120_000) }));
    await stale.sessions.validate(TOKEN, NOW);
    expect(stale.prisma.session.update).toHaveBeenCalled();
  });
});

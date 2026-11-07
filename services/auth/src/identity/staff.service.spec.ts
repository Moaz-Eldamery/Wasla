import { ApiError } from '../api-error.js';
import type { AuditService } from '../audit.service.js';
import type { SessionService, SessionUser } from '../authentication/session.service.js';
import { verifyPassword } from '../authentication/password.js';
import type { PrismaService } from '../prisma.service.js';
import { StaffService, temporaryPassword } from './staff.service.js';

const admin: SessionUser = {
  id: 'a0000000-0000-4000-8000-000000000001',
  type: 'STAFF',
  name: 'Demo Admin',
  phone: null,
  email: 'admin@wasla.test',
  roles: ['ADMIN'],
};
const doctorId = 'a0000000-0000-4000-8000-000000000002';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: doctorId,
    name: 'Dr. Rania Mostafa',
    email: 'rania@wasla.test',
    phone: null,
    roles: ['DOCTOR'],
    active: true,
    createdAt: new Date('2026-11-01T08:00:00Z'),
    ...overrides,
  };
}

function setup() {
  const prisma = {
    account: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ type: 'STAFF' }),
      create: vi.fn(),
      update: vi.fn(),
    },
    session: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const sessions = { validate: vi.fn() };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new StaffService(
    prisma as unknown as PrismaService,
    sessions as unknown as SessionService,
    audit as unknown as AuditService,
  );
  return { prisma, sessions, audit, service };
}

async function errorCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error.code;
    throw error;
  }
  return undefined;
}

describe('temporaryPassword', () => {
  it('makes 12 unambiguous characters in three groups, different each time', () => {
    const a = temporaryPassword();
    expect(a).toMatch(/^[a-km-np-zA-HJ-NP-Z2-9]{4}-[a-km-np-zA-HJ-NP-Z2-9]{4}-[a-km-np-zA-HJ-NP-Z2-9]{4}$/);
    expect(temporaryPassword()).not.toBe(a);
  });
});

describe('StaffService.requireAdmin', () => {
  it('lets an admin through', async () => {
    const { sessions, service } = setup();
    sessions.validate.mockResolvedValue(admin);
    expect(await service.requireAdmin('token', '/auth/staff')).toBe(admin);
  });

  it('answers 401 without a live session', async () => {
    const { sessions, service } = setup();
    sessions.validate.mockResolvedValue(null);
    expect(await errorCode(service.requireAdmin(null, '/auth/staff'))).toBe('UNAUTHENTICATED');
  });

  it('refuses other staff with 403 and audits it', async () => {
    const { sessions, audit, service } = setup();
    sessions.validate.mockResolvedValue({ ...admin, roles: ['RECEPTIONIST'] });
    expect(await errorCode(service.requireAdmin('token', '/auth/staff'))).toBe('FORBIDDEN');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'access.forbidden', outcome: 'DENIED' }),
    );
  });
});

describe('StaffService.create', () => {
  it('stores only the hash of the temporary password, returns it once, and audits without names', async () => {
    const { prisma, audit, service } = setup();
    prisma.account.create.mockImplementation(({ data }) => Promise.resolve(row({ ...data, id: doctorId })));

    const result = await service.create(admin, {
      name: ' Dr. Rania Mostafa ',
      email: 'Rania@Wasla.TEST',
      roles: ['DOCTOR'],
    });

    const data = prisma.account.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ type: 'STAFF', name: 'Dr. Rania Mostafa', email: 'rania@wasla.test', phone: null });
    expect(data.passwordHash).not.toContain(result.temporaryPassword);
    expect(await verifyPassword(data.passwordHash, result.temporaryPassword)).toBe(true);
    expect(result.staff).toMatchObject({ email: 'rania@wasla.test', roles: ['DOCTOR'], active: true });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'staff.create', entityType: 'account', entityId: doctorId, details: { roles: ['DOCTOR'] } }),
    );
  });

  it('refuses a work email another account has with EMAIL_TAKEN', async () => {
    const { prisma, service } = setup();
    prisma.account.findMany.mockResolvedValue([{ email: 'rania@wasla.test', phone: null }]);
    expect(
      await errorCode(service.create(admin, { name: 'Rania', email: 'RANIA@wasla.test', roles: ['DOCTOR'] })),
    ).toBe('EMAIL_TAKEN');
    expect(prisma.account.create).not.toHaveBeenCalled();
  });

  it("refuses a phone number a patient already uses with PHONE_TAKEN", async () => {
    const { prisma, service } = setup();
    prisma.account.findMany.mockResolvedValue([{ email: null, phone: '+201000000001' }]);
    expect(
      await errorCode(
        service.create(admin, { name: 'Rania', email: 'rania@wasla.test', phone: '+201000000001', roles: ['DOCTOR'] }),
      ),
    ).toBe('PHONE_TAKEN');
  });
});

describe('StaffService.setRoles', () => {
  it('replaces the roles and lists them in the screen order', async () => {
    const { prisma, service } = setup();
    prisma.account.update.mockResolvedValue(row({ roles: ['ADMIN', 'DOCTOR'] }));
    const updated = await service.setRoles(admin, doctorId, ['ADMIN', 'DOCTOR']);
    expect(updated.roles).toEqual(['DOCTOR', 'ADMIN']);
  });

  it("won't let an admin drop their own Admin role", async () => {
    const { prisma, audit, service } = setup();
    expect(await errorCode(service.setRoles(admin, admin.id, ['DOCTOR']))).toBe('FORBIDDEN');
    expect(prisma.account.update).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'DENIED' }));
  });

  it('answers 404 for a patient account', async () => {
    const { prisma, service } = setup();
    prisma.account.findUnique.mockResolvedValue({ type: 'PATIENT' });
    expect(await errorCode(service.setRoles(admin, doctorId, ['DOCTOR']))).toBe('NOT_FOUND');
  });
});

describe('StaffService.setActive', () => {
  it('deactivates and revokes every open session in the same transaction', async () => {
    const { prisma, audit, service } = setup();
    prisma.account.update.mockResolvedValue(row({ active: false }));

    const updated = await service.setActive(admin, doctorId, false);

    expect(updated.active).toBe(false);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ accountId: doctorId, revokedAt: null }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'staff.deactivate', details: { sessionsRevoked: 2 } }),
    );
  });

  it('reactivates without touching sessions', async () => {
    const { prisma, service } = setup();
    prisma.account.update.mockResolvedValue(row());
    await service.setActive(admin, doctorId, true);
    expect(prisma.session.updateMany).not.toHaveBeenCalled();
  });

  it("won't let an admin deactivate themselves", async () => {
    const { prisma, service } = setup();
    expect(await errorCode(service.setActive(admin, admin.id, false))).toBe('FORBIDDEN');
    expect(prisma.account.update).not.toHaveBeenCalled();
  });
});

describe('StaffService.list', () => {
  it('lists staff only, matching name, email or phone digits', async () => {
    const { prisma, service } = setup();
    await service.list('010 1234', 'active');
    expect(prisma.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          type: 'STAFF',
          active: true,
          OR: [
            { name: { contains: '010 1234', mode: 'insensitive' } },
            { email: { contains: '010 1234' } },
            { phone: { contains: '0101234' } },
          ],
        },
      }),
    );
  });
});

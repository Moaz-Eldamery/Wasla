import type { PrismaService } from '../../shared/prisma.service.js';
import { auditActionWhere, toAuditAction, toAuditEntityType } from './audit-actions.js';
import { AUDIT_PAGE_SIZE, AuditLogService } from './audit-log.service.js';

function row(id: number, action = 'appointment.check_in', outcome = 'SUCCESS') {
  return {
    id: BigInt(id),
    occurredAt: new Date('2026-11-06T08:00:00Z'),
    action,
    outcome,
    entityType: 'appointment',
    entityId: 'a0000000-0000-4000-8000-000000000001',
    ip: '10.0.0.1',
    actor: { id: 'b0000000-0000-4000-8000-000000000001', name: 'Nadia Hassan', type: 'STAFF' },
  };
}

function setup(rows: ReturnType<typeof row>[]) {
  const prisma = { auditLog: { findMany: vi.fn().mockResolvedValue(rows) } };
  return { prisma, service: new AuditLogService(prisma as unknown as PrismaService) };
}

describe('audit actions', () => {
  it.each([
    ['auth.login', 'SUCCESS', 'LOGIN'],
    ['auth.login', 'FAILED', 'LOGIN_FAILED'],
    ['auth.login', 'DENIED', 'LOGIN_FAILED'],
    ['queue.call_next', 'SUCCESS', 'VISIT_STARTED'],
    ['notes.summary', 'SUCCESS', 'NOTES_VIEWED'],
    ['result.download', 'SUCCESS', 'RESULT_VIEWED'],
    ['journey.read', 'SUCCESS', 'RECORD_VIEWED'],
    ['clinic.staff.assign', 'SUCCESS', 'CLINIC_STAFF_CHANGED'],
    ['something.new', 'SUCCESS', 'OTHER'],
  ] as const)('shows %s (%s) as %s', (name, outcome, action) => {
    expect(toAuditAction(name, outcome)).toBe(action);
  });

  it('filters by every stored name behind an action, and its outcomes', () => {
    expect(auditActionWhere('LOGIN_FAILED')).toEqual({
      action: { in: ['auth.login'] },
      outcome: { in: ['FAILED', 'DENIED'] },
    });
    expect(auditActionWhere('OTHER')).toMatchObject({ action: { notIn: expect.arrayContaining(['auth.login']) } });
  });

  it('writes entity types the contract way, and drops unknown ones', () => {
    expect(toAuditEntityType('test_order')).toBe('TEST_ORDER');
    expect(toAuditEntityType('mystery')).toBeNull();
    expect(toAuditEntityType(null)).toBeNull();
  });
});

describe('AuditLogService.search', () => {
  it('returns the newest 50 with a cursor for the next page', async () => {
    const rows = Array.from({ length: AUDIT_PAGE_SIZE + 1 }, (_, i) => row(500 - i));
    const { prisma, service } = setup(rows);

    const page = await service.search({});

    expect(page.entries).toHaveLength(AUDIT_PAGE_SIZE);
    expect(page.entries[0]).toMatchObject({ id: '500', action: 'CHECK_IN', entityType: 'APPOINTMENT' });
    expect(page.nextCursor).toBe('451');
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { id: 'desc' }, take: AUDIT_PAGE_SIZE + 1 }),
    );
  });

  it('has no cursor on the last page', async () => {
    const { service } = setup([row(2), row(1)]);
    expect((await service.search({})).nextCursor).toBeNull();
  });

  it('combines who, action, Cairo days and the cursor', async () => {
    const { prisma, service } = setup([]);
    await service.search({ who: 'nadia', action: 'CHECK_IN', from: '2026-11-01', to: '2026-11-06', cursor: '451' });

    expect(prisma.auditLog.findMany.mock.calls[0][0].where).toEqual({
      AND: [
        { actor: { OR: [{ name: { contains: 'nadia', mode: 'insensitive' } }] } },
        { action: { in: ['appointment.check_in'] } },
        { occurredAt: { gte: new Date('2026-10-31T22:00:00Z') } },
        { occurredAt: { lt: new Date('2026-11-06T22:00:00Z') } },
        { id: { lt: 451n } },
      ],
    });
  });

  it('also matches phone digits when "who" looks like a number', async () => {
    const { prisma, service } = setup([]);
    await service.search({ who: '010 1234' });
    expect(prisma.auditLog.findMany.mock.calls[0][0].where.AND[0].actor.OR).toContainEqual({
      phone: { contains: '0101234' },
    });
  });

  it('never selects the details column or an email', async () => {
    const { prisma, service } = setup([]);
    await service.search({});
    const select = prisma.auditLog.findMany.mock.calls[0][0].select;
    expect(select.details).toBeUndefined();
    expect(select.actor.select).toEqual({ id: true, name: true, type: true });
  });

  it('refuses a backwards range', async () => {
    const { service } = setup([]);
    await expect(service.search({ from: '2026-11-06', to: '2026-11-01' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });
});

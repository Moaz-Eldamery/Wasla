import { ApiError } from '../../shared/api-error.js';
import type { PrismaService } from '../../shared/prisma.service.js';
import { StatisticsService } from './statistics.service.js';

const MED = 'd0000000-0000-4000-8000-000000000001';
const PED = 'd0000000-0000-4000-8000-000000000002';
const OLD = 'd0000000-0000-4000-8000-000000000003';

const departments = [
  { id: MED, nameAr: 'الباطنة', nameEn: 'Internal Medicine', active: true },
  { id: OLD, nameAr: 'الجلدية', nameEn: 'Dermatology', active: false },
  { id: PED, nameAr: 'الأطفال', nameEn: 'Pediatrics', active: true },
];

/** An appointment whose slot starts at `slot` (UTC) in a clinic of `dept`. */
function appt(
  dept: string,
  slot: string,
  status: string,
  wait?: { checkedIn: string; started: string },
) {
  return {
    status,
    checkedInAt: wait ? new Date(wait.checkedIn) : null,
    startedAt: wait ? new Date(wait.started) : null,
    slot: { startsAt: new Date(slot), clinic: { departmentId: dept } },
  };
}

function setup(rows: ReturnType<typeof appt>[], depts = departments) {
  const prisma = {
    department: { findMany: vi.fn().mockResolvedValue(depts) },
    appointment: { findMany: vi.fn().mockResolvedValue(rows) },
  };
  return { prisma, service: new StatisticsService(prisma as unknown as PrismaService) };
}

// "Today" in Cairo is 6 November 2026.
const NOW = new Date('2026-11-06T12:00:00Z');

describe('StatisticsService.get', () => {
  it('counts visits per department, average wait and no-show rate per Cairo day', async () => {
    const { service } = setup([
      // 5 Nov in Cairo: two completed in Internal Medicine (waits 10 and 20 min), one no-show.
      appt(MED, '2026-11-05T07:00:00Z', 'COMPLETED', { checkedIn: '2026-11-05T06:50:00Z', started: '2026-11-05T07:00:00Z' }),
      appt(MED, '2026-11-05T08:00:00Z', 'COMPLETED', { checkedIn: '2026-11-05T07:50:00Z', started: '2026-11-05T08:10:00Z' }),
      appt(PED, '2026-11-05T09:00:00Z', 'NO_SHOW'),
      // 23:30 UTC on 5 Nov is already 6 Nov in Cairo.
      appt(PED, '2026-11-05T23:30:00Z', 'COMPLETED', { checkedIn: '2026-11-05T23:20:00Z', started: '2026-11-05T23:35:00Z' }),
    ]);

    const stats = await service.get('2026-11-05', '2026-11-07', undefined, NOW);

    expect(stats.departments.map((d) => d.id)).toEqual([MED, PED]);
    expect(stats.days).toEqual([
      {
        date: '2026-11-05',
        visits: [
          { departmentId: MED, count: 2 },
          { departmentId: PED, count: 0 },
        ],
        averageWaitMinutes: 15,
        noShowRate: 0.3333,
      },
      {
        date: '2026-11-06',
        visits: [
          { departmentId: MED, count: 0 },
          { departmentId: PED, count: 1 },
        ],
        averageWaitMinutes: 15,
        noShowRate: 0,
      },
      // A day still to come has nothing to measure.
      { date: '2026-11-07', visits: null, averageWaitMinutes: null, noShowRate: null },
    ]);
    // Weighted over the range: 1 no-show of 4 appointments, waits 10, 20 and 15.
    expect(stats.totals).toEqual({ visits: 3, averageWaitMinutes: 15, noShowRate: 0.25 });
  });

  it('shows "nothing to measure" (null), not 0, for a day without appointments', async () => {
    const { service } = setup([]);
    const stats = await service.get('2026-11-01', '2026-11-02', undefined, NOW);
    expect(stats.days.every((d) => d.visits === null && d.noShowRate === null)).toBe(true);
    expect(stats.totals).toEqual({ visits: null, averageWaitMinutes: null, noShowRate: null });
  });

  it('keeps an inactive department only while it has visits in the range', async () => {
    const { service } = setup([appt(OLD, '2026-11-05T07:00:00Z', 'COMPLETED')]);
    const stats = await service.get('2026-11-05', '2026-11-05', undefined, NOW);
    expect(stats.departments.map((d) => d.id)).toEqual([MED, OLD, PED]);

    const { service: quiet } = setup([appt(MED, '2026-11-05T07:00:00Z', 'COMPLETED')]);
    expect((await quiet.get('2026-11-05', '2026-11-05', undefined, NOW)).departments.map((d) => d.id)).toEqual([MED, PED]);
  });

  it('only asks for clinical departments, and leaves cancelled appointments out', async () => {
    const { prisma, service } = setup([]);
    await service.get('2026-11-05', '2026-11-05', MED, NOW);
    expect(prisma.department.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { kind: 'CLINICAL', id: MED } }),
    );
    expect(prisma.appointment.findMany.mock.calls[0][0].where.status).toEqual({ not: 'CANCELLED' });
  });

  it('refuses a department filter that is not a clinical department', async () => {
    const { service } = setup([], []);
    await expect(service.get('2026-11-05', '2026-11-05', MED, NOW)).rejects.toBeInstanceOf(ApiError);
  });

  it.each([
    ['backwards', '2026-11-05', '2026-11-04'],
    ['longer than 92 days', '2026-08-01', '2026-11-01'],
  ])('refuses a range that is %s', async (_name, from, to) => {
    const { service } = setup([]);
    await expect(service.get(from, to, undefined, NOW)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('accepts exactly 92 days', async () => {
    const { service } = setup([]);
    const stats = await service.get('2026-08-07', '2026-11-06', undefined, NOW);
    expect(stats.days).toHaveLength(92);
  });
});

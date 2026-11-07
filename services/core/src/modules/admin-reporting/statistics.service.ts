import { Injectable } from '@nestjs/common';
import { ApiError } from '../../shared/api-error.js';
import {
  addDays,
  cairoToday,
  daysBetween,
  startOfCairoDay,
} from '../../shared/cairo-time.js';
import type { LocalizedText } from '../../shared/clinic.views.js';
import { PrismaService } from '../../shared/prisma.service.js';

/** Longest range, both ends counted (business.md, "Admin statistics"). */
export const MAX_RANGE_DAYS = 92;

export interface StatisticsDayView {
  date: string;
  /** One entry per department in `departments`; null when there's nothing to measure. */
  visits: { departmentId: string; count: number }[] | null;
  averageWaitMinutes: number | null;
  noShowRate: number | null;
}

/** The contract's `Statistics`. */
export interface StatisticsView {
  from: string;
  to: string;
  departmentId: string | null;
  departments: { id: string; name: LocalizedText }[];
  days: StatisticsDayView[];
  totals: {
    visits: number | null;
    averageWaitMinutes: number | null;
    noShowRate: number | null;
  };
}

interface DayTally {
  due: number;
  noShows: number;
  visits: Map<string, number>;
  waitMinutes: number[];
}

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;
const average = (values: number[]) =>
  values.length ? round(values.reduce((a, b) => a + b, 0) / values.length, 1) : null;

/**
 * IAdmin: hospital statistics (KAN-39). Counts and averages only: nothing
 * about a patient leaves this service. Each appointment counts on the Cairo
 * day of its slot. Definitions are in business.md ("Admin statistics").
 */
@Injectable()
export class StatisticsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(
    from: string,
    to: string,
    departmentId?: string,
    now: Date = new Date(),
  ): Promise<StatisticsView> {
    const span = daysBetween(from, to);
    if (span < 0 || span >= MAX_RANGE_DAYS) {
      throw new ApiError(
        400,
        'VALIDATION_FAILED',
        `\`to\` must be on or after \`from\`, and the range at most ${MAX_RANGE_DAYS} days.`,
        [{ field: 'to', problem: 'out of range' }],
      );
    }

    const clinical = await this.prisma.department.findMany({
      where: { kind: 'CLINICAL', ...(departmentId && { id: departmentId }) },
      select: { id: true, nameAr: true, nameEn: true, active: true },
      orderBy: { nameEn: 'asc' },
    });
    if (departmentId && clinical.length === 0) {
      throw new ApiError(400, 'VALIDATION_FAILED', 'That is not a clinical department.', [
        { field: 'departmentId', problem: 'not a clinical department' },
      ]);
    }

    const rows = await this.prisma.appointment.findMany({
      where: {
        status: { not: 'CANCELLED' },
        slot: {
          startsAt: { gte: startOfCairoDay(from), lt: startOfCairoDay(addDays(to, 1)) },
          clinic: { departmentId: { in: clinical.map((d) => d.id) } },
        },
      },
      select: {
        status: true,
        checkedInAt: true,
        startedAt: true,
        slot: { select: { startsAt: true, clinic: { select: { departmentId: true } } } },
      },
    });

    const tallies = new Map<string, DayTally>();
    const departmentsWithVisits = new Set<string>();
    for (const row of rows) {
      const day = cairoToday(row.slot.startsAt);
      const tally: DayTally = tallies.get(day) ?? { due: 0, noShows: 0, visits: new Map(), waitMinutes: [] };
      tally.due += 1;
      if (row.status === 'NO_SHOW') tally.noShows += 1;
      if (row.status === 'COMPLETED') {
        const dept = row.slot.clinic.departmentId;
        tally.visits.set(dept, (tally.visits.get(dept) ?? 0) + 1);
        departmentsWithVisits.add(dept);
      }
      if (row.checkedInAt && row.startedAt) {
        tally.waitMinutes.push(Math.max(0, (row.startedAt.getTime() - row.checkedInAt.getTime()) / 60_000));
      }
      tallies.set(day, tally);
    }

    // Inactive departments only show while they have visits in the range.
    const departments = clinical
      .filter((d) => d.active || departmentsWithVisits.has(d.id))
      .map((d) => ({ id: d.id, name: { ar: d.nameAr, en: d.nameEn } }));

    const today = cairoToday(now);
    const days: StatisticsDayView[] = [];
    for (let day = from; day <= to; day = addDays(day, 1)) {
      const tally = tallies.get(day);
      // A day still to come, or one with no appointments, has nothing to measure.
      if (day > today || !tally) {
        days.push({ date: day, visits: null, averageWaitMinutes: null, noShowRate: null });
        continue;
      }
      days.push({
        date: day,
        visits: departments.map((d) => ({ departmentId: d.id, count: tally.visits.get(d.id) ?? 0 })),
        averageWaitMinutes: average(tally.waitMinutes),
        noShowRate: round(tally.noShows / tally.due, 4),
      });
    }

    // Weighted over the whole range, not an average of the days.
    const measured = [...tallies.entries()].filter(([day]) => day <= today).map(([, t]) => t);
    const due = measured.reduce((n, t) => n + t.due, 0);
    const counted = days.filter((d) => d.visits !== null);
    return {
      from,
      to,
      departmentId: departmentId ?? null,
      departments,
      days,
      totals: {
        visits: counted.length
          ? counted.reduce((n, d) => n + d.visits!.reduce((m, v) => m + v.count, 0), 0)
          : null,
        averageWaitMinutes: average(measured.flatMap((t) => t.waitMinutes)),
        noShowRate: due ? round(measured.reduce((n, t) => n + t.noShows, 0) / due, 4) : null,
      },
    };
  }
}

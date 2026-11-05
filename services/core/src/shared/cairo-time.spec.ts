import {
  addDays,
  cairoDayRange,
  cairoToday,
  daysBetween,
  isCairoDay,
  startOfCairoDay,
} from './cairo-time.js';

describe('cairo-time', () => {
  it('starts a winter day at 22:00 UTC the day before (UTC+2)', () => {
    expect(startOfCairoDay('2026-01-15').toISOString()).toBe('2026-01-14T22:00:00.000Z');
  });

  it('starts a summer day at 21:00 UTC the day before (UTC+3)', () => {
    expect(startOfCairoDay('2026-07-15').toISOString()).toBe('2026-07-14T21:00:00.000Z');
  });

  // Egypt's DST starts on the last Friday of April: midnight doesn't exist,
  // the clock jumps from 00:00 to 01:00.
  it('handles the spring change: a 23-hour day', () => {
    const { start, end } = cairoDayRange('2026-04-24');
    expect(start.toISOString()).toBe('2026-04-23T22:00:00.000Z');
    expect(end.toISOString()).toBe('2026-04-24T21:00:00.000Z');
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(23);
  });

  // DST ends on the last Thursday of October at midnight: 25-hour day.
  it('handles the autumn change: a 25-hour day', () => {
    const { start, end } = cairoDayRange('2026-10-29');
    expect(start.toISOString()).toBe('2026-10-28T21:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-29T22:00:00.000Z');
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(25);
  });

  it("gives Cairo's date, not UTC's", () => {
    // 23:30 UTC on Jan 14 is already Jan 15 in Cairo.
    expect(cairoToday(new Date('2026-01-14T23:30:00Z'))).toBe('2026-01-15');
    expect(cairoToday(new Date('2026-01-14T21:30:00Z'))).toBe('2026-01-14');
  });

  it('validates calendar days', () => {
    expect(isCairoDay('2026-02-28')).toBe(true);
    expect(isCairoDay('2026-02-30')).toBe(false);
    expect(isCairoDay('2026-2-1')).toBe(false);
    expect(isCairoDay('tomorrow')).toBe(false);
  });

  it('adds and counts days across months', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30);
  });
});

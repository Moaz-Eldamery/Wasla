// Times are stored in UTC; calendar days (the `date` query parameters) are
// Cairo days. Egypt has daylight saving time, so a Cairo day isn't always
// UTC+2 and can be 23 or 25 hours long.

const ZONE = 'Africa/Cairo';
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

const parts = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Cairo's offset from UTC at a given instant, in milliseconds. */
function offsetAt(instant: number): number {
  const p = Object.fromEntries(
    parts.formatToParts(new Date(instant)).map((x) => [x.type, x.value]),
  );
  const wallClock = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return wallClock - Math.floor(instant / 1000) * 1000;
}

/** True for a real calendar day written as `YYYY-MM-DD`. */
export function isCairoDay(value: string): boolean {
  const m = DAY.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

/** The instant a Cairo day starts (its first moment, even on a DST change). */
export function startOfCairoDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  // Two passes: the offset at the guess can differ from the offset at the answer.
  const guess = utcMidnight - offsetAt(utcMidnight);
  return new Date(utcMidnight - offsetAt(guess));
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (both `YYYY-MM-DD`). */
export function daysBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / 86_400_000;
}

/** [start, end) of a Cairo day, as UTC instants. */
export function cairoDayRange(day: string): { start: Date; end: Date } {
  return { start: startOfCairoDay(day), end: startOfCairoDay(addDays(day, 1)) };
}

/** Today's date in Cairo, `YYYY-MM-DD`. */
export function cairoToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(now);
}

/**
 * Leaderboard and mission windows in a named IANA timezone (Africa/Nairobi).
 * Keys are stable strings: YYYY-MM-DD, YYYY-Www, YYYY-MM, or "once".
 */
import type { MissionPeriod } from '@bottle-flip/content';

export interface Window {
  key: string;
  start: Date;
  end: Date;
}

interface LocalDate {
  y: number;
  m: number;
  d: number;
}

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

function offsetMs(date: Date, timeZone: string): number {
  // Difference between "wall clock in tz" and UTC, used to convert Date → local calendar day.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Converts a UTC Date to a local calendar date in the given timezone.
 * @param date - UTC Date object.
 * @param timeZone - IANA timezone string (e.g., "Africa/Nairobi").
 * @returns Object with year, month [1-12], and day [1-31].
 * @private
 */
export function localDate(date: Date, timeZone: string): LocalDate {
  const shifted = new Date(date.getTime() + offsetMs(date, timeZone));
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate() };
}

function startOfLocal(ld: LocalDate, timeZone: string): Date {
  const guess = Date.UTC(ld.y, ld.m - 1, ld.d);
  return new Date(guess - offsetMs(new Date(guess), timeZone));
}

/**
 * Generates a stable day identifier key in YYYY-MM-DD format for a given timezone.
 * Used as a window key for daily leaderboards and missions.
 * @param date - UTC Date.
 * @param timeZone - IANA timezone string.
 * @returns Day key string (e.g., "2026-10-07").
 */
export function dayKey(date: Date, timeZone: string): string {
  const ld = localDate(date, timeZone);
  return `${ld.y}-${pad(ld.m)}-${pad(ld.d)}`;
}

function isoWeek(ld: LocalDate): { year: number; week: number; mondayUtc: number } {
  const utc = Date.UTC(ld.y, ld.m - 1, ld.d);
  const dow = (new Date(utc).getUTCDay() + 6) % 7;
  const monday = utc - dow * DAY_MS;
  const thursday = monday + 3 * DAY_MS;
  const year = new Date(thursday).getUTCFullYear();
  const week = Math.floor((thursday - Date.UTC(year, 0, 1)) / (7 * DAY_MS)) + 1;
  return { year, week, mondayUtc: monday };
}

function fromUtcMidnight(utc: number): LocalDate {
  const d = new Date(utc);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

/**
 * Returns the leaderboard or mission window containing the given date in the campaign's timezone.
 * Windows are stable: the same date always returns the same window start/end.
 * @param period - Window period: 'daily', 'weekly', 'monthly', or 'once'.
 * @param date - The date to find the window for (UTC).
 * @param timeZone - IANA timezone string (e.g., "Africa/Nairobi").
 * @returns Window with key (YYYY-MM-DD, YYYY-Www, YYYY-MM, or "once"), start, and end.
 */
export function windowFor(period: MissionPeriod, date: Date, timeZone: string): Window {
  const ld = localDate(date, timeZone);
  switch (period) {
    case 'daily': {
      const start = startOfLocal(ld, timeZone);
      const next = fromUtcMidnight(Date.UTC(ld.y, ld.m - 1, ld.d) + DAY_MS);
      return { key: dayKey(date, timeZone), start, end: startOfLocal(next, timeZone) };
    }
    case 'weekly': {
      const { year, week, mondayUtc } = isoWeek(ld);
      return {
        key: `${year}-W${pad(week)}`,
        start: startOfLocal(fromUtcMidnight(mondayUtc), timeZone),
        end: startOfLocal(fromUtcMidnight(mondayUtc + 7 * DAY_MS), timeZone),
      };
    }
    case 'monthly': {
      const next = ld.m === 12 ? { y: ld.y + 1, m: 1, d: 1 } : { y: ld.y, m: ld.m + 1, d: 1 };
      return { key: `${ld.y}-${pad(ld.m)}`, start: startOfLocal({ ...ld, d: 1 }, timeZone), end: startOfLocal(next, timeZone) };
    }
    case 'once':
      return { key: 'once', start: new Date(0), end: new Date('9999-12-31T00:00:00Z') };
  }
}

/**
 * Returns the window that ended most recently before the one containing the given date.
 * Used to query previous leaderboard snapshots for ranking history.
 * @param period - Window period: 'daily', 'weekly', or 'monthly' (not 'once').
 * @param date - Reference date (UTC).
 * @param timeZone - IANA timezone string.
 * @returns The previous window.
 */
export function previousWindow(period: Exclude<MissionPeriod, 'once'>, date: Date, timeZone: string): Window {
  const current = windowFor(period, date, timeZone);
  return windowFor(period, new Date(current.start.getTime() - 1), timeZone);
}

/**
 * Formats a countdown duration (milliseconds) for display.
 * Dynamically chooses units (days, hours, minutes) to keep the string short.
 *
 * @param ms - Milliseconds remaining.
 * @returns Display string (e.g., "2d 5h", "45m", "1d").
 * @example
 * formatCountdown(3600000) // "1h 0m"
 * formatCountdown(86400000) // "1d"
 */
export function formatCountdown(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

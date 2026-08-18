/**
 * Stamping a moment so it survives a year of travel and two DST changes.
 *
 * An epoch millisecond alone is not enough: "2026-03-14T09:00Z" tells you
 * nothing about whether that was an early start or the middle of the night
 * for the person who lived it. Every stream row therefore carries the zone
 * and the UTC offset that were in force AT WRITE TIME, plus the local day the
 * row belongs to — which is not always its calendar day (a routine whose
 * window wraps past midnight logs to the evening it started; see
 * routineLogDay in lib/progress.ts).
 */

import { toDay } from "./dates";
import { DEFAULT_DAY_ROLLOVER_HOUR } from "./types";

export interface Stamp {
  /** epoch ms */
  at: number;
  /** the local day this belongs to, YYYY-MM-DD */
  day: string;
  /** IANA zone, e.g. "Asia/Kolkata" — empty string when the browser won't say */
  tz: string;
  /** minutes east of UTC (IST = 330), as of `at` */
  utcOffsetMinutes: number;
}

/** The browser's IANA zone, or "" when it isn't available. */
export function currentTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return "";
  }
}

/** Minutes east of UTC at `d`. getTimezoneOffset() counts the other way. */
export function utcOffsetMinutes(d = new Date()): number {
  return -d.getTimezoneOffset();
}

/**
 * Stamp "now". `day` overrides the calendar day for the rows that belong to a
 * different one — a night routine ticked at 1am belongs to yesterday, and the
 * caller is the only one that knows that.
 */
export function stamp(day?: string, at = Date.now()): Stamp {
  const d = new Date(at);
  return {
    at,
    day: day ?? toDay(d),
    tz: currentTimezone(),
    utcOffsetMinutes: utcOffsetMinutes(d),
  };
}

/**
 * The day a moment belongs to once the rollover hour is applied: with the
 * default 4, anything before 4am counts as the previous day, because the
 * calendar flips at midnight but the person doesn't.
 *
 * This is the same rule routineLogDay() applies to wrapped routines, stated
 * once so the export's README can describe one rule rather than two.
 */
export function dayWithRollover(at: number, rolloverHour = DEFAULT_DAY_ROLLOVER_HOUR): string {
  const d = new Date(at);
  if (d.getHours() < rolloverHour) d.setDate(d.getDate() - 1);
  return toDay(d);
}

/** "09:05" — local wall-clock time of a moment, for the export's `local_time`
 *  column, so time-of-day questions need no timezone maths from the reader. */
export function localTime(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Tuesday" — for the export's `weekday` column. */
export function weekdayName(at: number): string {
  return WEEKDAYS[new Date(at).getDay()];
}

/** The weekday of a YYYY-MM-DD day string, read at noon so a DST jump at
 *  midnight can never shift it by one. */
export function weekdayOfDay(day: string): string {
  return WEEKDAYS[new Date(`${day}T12:00:00`).getDay()];
}

/** ISO-8601 with offset, e.g. "2026-08-18T09:05:11+05:30" — the export's
 *  timestamp column. Written by hand rather than toISOString() because the
 *  offset is the whole point: UTC would throw away the fact we recorded. */
export function isoWithOffset(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  const off = utcOffsetMinutes(d);
  const sign = off < 0 ? "-" : "+";
  const abs = Math.abs(off);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

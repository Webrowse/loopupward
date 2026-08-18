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

/* ————— rendering a moment in the zone it actually happened in —————
 *
 * Every timestamp in the export used to be rendered with `new Date(ms)` in
 * whatever zone the EXPORTING device happened to sit in. Export from London a
 * year of living in Delhi and every local time shifted by five and a half
 * hours, some weekdays flipped, and focus_sessions.csv contradicted its own
 * `timezone` column. The README promised the opposite in bold.
 *
 * There are three grades of answer available, and the export says which one
 * each file got rather than quietly presenting all three as the same thing:
 *
 *   recorded — the row stored the offset in force at that instant (the two
 *              capture streams do). Exact, travel and DST included.
 *   profile  — the row did not, so the user's own timezone is used. Right
 *              except while travelling, and honest about being an assumption.
 *   exporter — no zone is known at all. Last resort.
 */

export type ZoneRef =
  | { kind: "recorded"; offsetMinutes: number }
  | { kind: "profile"; tz: string }
  | { kind: "exporter" };

export type ZoneSource = ZoneRef["kind"];

export interface RenderedTime {
  iso: string;
  local: string;
  weekday: string;
  offsetMinutes: number;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function offsetSuffix(min: number): string {
  const sign = min < 0 ? "-" : "+";
  const abs = Math.abs(min);
  return `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

/** Civil date-time fields for an instant in a named IANA zone. Computed via
 *  Intl rather than by date arithmetic, so historical DST rules apply. */
function partsInZone(at: number, tz: string): { y: number; mo: number; d: number; h: number; mi: number; s: number } | null {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const got: Record<string, number> = {};
    for (const part of dtf.formatToParts(new Date(at))) {
      if (part.type !== "literal") got[part.type] = Number(part.value);
    }
    if (![got.year, got.month, got.day, got.hour, got.minute, got.second].every(Number.isFinite)) return null;
    // Intl renders midnight as hour 24 in some engines
    return { y: got.year, mo: got.month, d: got.day, h: got.hour % 24, mi: got.minute, s: got.second };
  } catch {
    return null; // an unknown zone string is not worth throwing an export away for
  }
}

/** Render one instant according to `zone`, falling back down the grades rather
 *  than failing: a wrong-looking zone name must never lose the timestamp. */
export function renderTime(at: number, zone: ZoneRef): RenderedTime {
  if (zone.kind === "recorded") {
    // shift the instant by the offset that was in force and read it as UTC:
    // exact, and it uses the number the row itself recorded
    const shifted = new Date(at + zone.offsetMinutes * 60_000);
    return {
      iso:
        `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}` +
        `T${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}:${pad2(shifted.getUTCSeconds())}` +
        offsetSuffix(zone.offsetMinutes),
      local: `${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}`,
      weekday: WEEKDAYS[shifted.getUTCDay()],
      offsetMinutes: zone.offsetMinutes,
    };
  }
  if (zone.kind === "profile") {
    const p = partsInZone(at, zone.tz);
    if (p) {
      const offset = Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - at) / 60_000);
      return renderTime(at, { kind: "recorded", offsetMinutes: offset });
    }
  }
  // exporter's own zone — what every column used to do, now only the fallback
  const d = new Date(at);
  return {
    iso: isoWithOffset(at),
    local: localTime(at),
    weekday: weekdayName(at),
    offsetMinutes: utcOffsetMinutes(d),
  };
}

/** The zone a row without its own recorded offset should be read in. */
export function profileZone(timezone: string | null | undefined): ZoneRef {
  return timezone ? { kind: "profile", tz: timezone } : { kind: "exporter" };
}

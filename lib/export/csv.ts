/**
 * CSV, written for a person and a spreadsheet at the same time.
 *
 * RFC 4180 quoting, a header row on every file, and — the part that matters —
 * every timestamp appears three ways: as ISO-8601 with its UTC offset, as a
 * local HH:MM, and as a weekday name. "When do I actually work?" should be
 * answerable by sorting a column, not by doing timezone arithmetic against a
 * separate settings file.
 */

import { isoWithOffset, localTime, weekdayName, weekdayOfDay } from "../clock";

export type CsvValue = string | number | boolean | null | undefined;

/** RFC 4180: quote anything containing a comma, quote, CR or LF; double the
 *  quotes inside. A leading/trailing space is quoted too, since spreadsheets
 *  otherwise eat it. */
export function csvField(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "boolean" ? (value ? "true" : "false") : String(value);
  if (s === "") return "";
  const needsQuotes = /[",\r\n]/.test(s) || s !== s.trim();
  return needsQuotes ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(values: CsvValue[]): string {
  return values.map(csvField).join(",");
}

/**
 * A whole file. CRLF line endings, because that is what RFC 4180 says and
 * what Excel expects; every reader that matters accepts them.
 */
export function csvFile(header: string[], rows: CsvValue[][]): string {
  return [csvRow(header), ...rows.map(csvRow)].join("\r\n") + "\r\n";
}

/** The three columns a timestamp becomes: ISO with offset, local HH:MM, and
 *  the weekday it fell on. Returns them in header order. */
export function timeColumns(at: number | null | undefined): [string, string, string] {
  if (at === null || at === undefined) return ["", "", ""];
  return [isoWithOffset(at), localTime(at), weekdayName(at)];
}

/** Header names for a timestamp column group, e.g. timeHeaders("done") →
 *  ["done_at", "done_local_time", "done_weekday"]. */
export function timeHeaders(prefix: string): [string, string, string] {
  return [`${prefix}_at`, `${prefix}_local_time`, `${prefix}_weekday`];
}

/** The weekday of a YYYY-MM-DD day column, so day-shaped rows can answer
 *  weekday questions without a timestamp. */
export function dayWeekday(day: string | null | undefined): string {
  return day ? weekdayOfDay(day) : "";
}

/** Seconds → minutes with one decimal, the unit every duration column uses.
 *  One unit throughout beats a mix of seconds here and minutes there. */
export function minutesOf(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "";
  return String(Math.round((seconds / 60) * 10) / 10);
}

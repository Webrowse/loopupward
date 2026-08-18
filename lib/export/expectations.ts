/**
 * What was supposed to happen, day by day.
 *
 * The rest of the export records what did happen. Nothing recorded what was
 * *due* — and a missed day is not a row anywhere, it is the absence of one. So
 * "which habits are actually established", "what is my real adherence", "which
 * weekday breaks my streaks" were not answerable without re-implementing the
 * app's scheduling rules from scratch, against cadences that may since have
 * changed. This file expands the schedule into an explicit expectation per day
 * so the comparison is a join rather than a reconstruction.
 *
 * It states an expectation only where one can be established. Where the cadence
 * of the time is unknown (the day predates the event stream), the row says
 * `unknown` rather than assuming today's schedule applied back then.
 */

import { addDays, dayFromMs, isoWeek } from "../dates";
import { dayLogged } from "../progress";
import { Cadence, DB, Item } from "../types";
import { cadenceAsOfDay, dailyTargetAsOfDay, ItemHistory, stateKnown } from "./history";

/**
 * required — a fixed schedule named this exact day
 * not_due  — a fixed schedule ran that day, and did not name it
 * eligible — a quota schedule ("4× a week"); no single day is owed, the period is
 * unknown  — the schedule of the time was never recorded; today's is not evidence
 */
export type Expectation = "required" | "not_due" | "eligible" | "unknown";

export interface ExpectationRow {
  itemId: string;
  day: string;
  expectation: Expectation;
  /** the schedule in force on the day, blank when unknown */
  cadence: Cadence;
  cadenceDetail: string;
  cadenceKnown: boolean;
  /** for quota schedules: which week/month the day counts toward, and how many */
  quotaPeriod: string;
  quotaTarget: number | null;
  /** how much the day had to reach to count, as of that day */
  dailyTarget: number | null;
  targetKnown: boolean;
  valueLogged: number;
  /** null when the target of the time is unknown — never guessed */
  met: boolean | null;
}

/** Mirrors effectiveCadence() in lib/progress.ts: habits and routines are
 *  daily unless told otherwise, everything else needs an explicit schedule. */
function effective(cadence: Cadence, item: Item): Cadence {
  return cadence ?? (item.kind === "habit" || item.kind === "routine" ? "daily" : null);
}

function detailOf(cadence: Cadence, days: number[] | null, count: number | null): string {
  if (cadence === "days") return (days ?? []).join(" ");
  if (cadence === "weekly") return String(count ?? 1);
  return "";
}

/** Items that carry a schedule now, or carried one at some point. */
function scheduledItems(db: DB, history: ItemHistory): Item[] {
  return db.items.filter(
    (i) => effective(i.cadence, i) !== null || history.cadenceChanges.has(i.id)
  );
}

/**
 * One row per scheduled item per day it was alive, within [start, end].
 *
 * The window closes when the item does: retiring a habit ends its expectations
 * that day, so the months after it was deliberately stopped are not counted as
 * months of failure.
 */
export function buildExpectations(
  db: DB,
  history: ItemHistory,
  span: { start: string; end: string } | null,
  today: string
): ExpectationRow[] {
  if (!span) return [];
  const rows: ExpectationRow[] = [];
  // never past the day the export was taken: a day that has not happened yet
  // cannot have been missed, and the overall span can run ahead of `today`
  const horizon = span.end < today ? span.end : today;

  for (const item of scheduledItems(db, history)) {
    const born = dayFromMs(item.createdAt);
    const start = born > span.start ? born : span.start;
    const retired = item.completedAt ? dayFromMs(item.completedAt) : null;
    const trashed = item.deletedAt ? dayFromMs(item.deletedAt) : null;
    let end = horizon;
    if (retired && retired < end) end = retired;
    if (trashed && trashed < end) end = trashed;
    if (start > end) continue;

    // logged units per day, read once per item rather than per day
    const perDay = new Map<string, number>();
    for (const l of db.logs) {
      if (l.itemId === item.id && l.op === "add") {
        perDay.set(l.date, (perDay.get(l.date) ?? 0) + l.value);
      }
    }

    for (let day = start; day <= end; day = addDays(day, 1)) {
      const known = stateKnown(history, item.id, day);
      const shape = cadenceAsOfDay(history, item, day);
      const cadence = effective(shape.value.cadence, item);
      if (cadence === null && known) continue; // genuinely unscheduled that day

      const target = dailyTargetAsOfDay(history, item, day);
      const value = perDay.get(day) ?? dayLogged(db.logs, item.id, day);
      const dow = new Date(`${day}T12:00:00`).getDay();

      let expectation: Expectation;
      let quotaPeriod = "";
      let quotaTarget: number | null = null;
      if (!known) {
        expectation = "unknown";
      } else if (cadence === "daily") {
        expectation = "required";
      } else if (cadence === "weekdays") {
        expectation = dow >= 1 && dow <= 5 ? "required" : "not_due";
      } else if (cadence === "days") {
        expectation = (shape.value.cadenceDays ?? []).includes(dow) ? "required" : "not_due";
      } else if (cadence === "weekly") {
        const { year, week } = isoWeek(day);
        expectation = "eligible";
        quotaPeriod = `${year}-W${String(week).padStart(2, "0")}`;
        quotaTarget = shape.value.cadenceCount ?? 1;
      } else {
        expectation = "eligible";
        quotaPeriod = day.slice(0, 7);
        quotaTarget = 1;
      }

      rows.push({
        itemId: item.id,
        day,
        expectation,
        cadence: known ? cadence : null,
        cadenceDetail: known
          ? detailOf(cadence, shape.value.cadenceDays, shape.value.cadenceCount)
          : "",
        cadenceKnown: known,
        quotaPeriod,
        quotaTarget,
        dailyTarget: target.value,
        targetKnown: target.known,
        valueLogged: value,
        // the whole point: no target of the time, no verdict
        met: target.known && target.value != null ? value >= target.value : null,
      });
    }
  }

  return rows.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.itemId < b.itemId ? -1 : 1));
}

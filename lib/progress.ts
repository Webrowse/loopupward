import { Action, Cadence, DB, Item, ListEntry, Log } from "./types";
import { addDays, dayFromMs, daysBetween, Period, periodKey, startOfWeek, toDay, today } from "./dates";

/**
 * Progress flows upward: an item's progress is its own tracker progress,
 * or — when it has none — the average progress of its children, recursively.
 */

export function children(db: DB, itemId: string): Item[] {
  return db.items
    .filter((i) => i.parentId === itemId && i.status !== "archived")
    .sort((a, b) => a.position - b.position);
}

export function ownProgress(item: Item): number | null {
  if (item.status === "done") return 1;
  // a list measures itself by its ticked entries — its tracker is "none",
  // which would otherwise fall through to averaging children
  if (item.kind === "list" && item.entries && item.entries.length > 0) {
    return item.entries.filter((e) => e.done).length / item.entries.length;
  }
  switch (item.tracker) {
    case "check":
      return item.completedAt ? 1 : 0;
    case "percent":
      return clamp01(item.current / 100);
    case "counter":
    case "money":
    case "book":
      return item.target && item.target > 0 ? clamp01(item.current / item.target) : null;
    case "habit":
    case "none":
      return null;
  }
}

export function itemProgress(db: DB, item: Item, depth = 0): number | null {
  if (depth > 12) return null; // guard against pathological cycles
  const kids = children(db, item.id);
  // a "done/not done" goal that has things nested inside derives its
  // percentage from what's inside, not its own untouched checkbox — unless
  // it was explicitly completed itself, which always wins
  const own = item.tracker === "check" && kids.length > 0 && item.status !== "done"
    ? null
    : ownProgress(item);
  if (own !== null) return own;
  const kidVals = kids
    .map((k) => itemProgress(db, k, depth + 1))
    .filter((v): v is number => v !== null);
  if (kidVals.length === 0) return item.status === "done" ? 1 : null;
  return kidVals.reduce((a, b) => a + b, 0) / kidVals.length;
}

/** Everything carrying a given planning horizon, anchored to one specific
 *  instance of it (the week of Jul 6, August, Q3, 2026…) so Week/Month/
 *  Quarter/Year lists can be navigated like a real calendar. `horizonPeriod`
 *  stores any day inside that instance (not a formatted key) so the prev/next
 *  steppers are plain date arithmetic — comparison goes through periodKey.
 *  Items from before this existed have no anchor — they fall back to
 *  "whichever instance is current right now" so nothing old silently
 *  disappears. */
export function horizonEntries(db: DB, period: Period, anchor: string): Item[] {
  const key = periodKey(period, anchor);
  const isCurrent = key === periodKey(period, today());
  const doneRank = (item: Item) => (item.status === "done" ? 1 : 0);
  return db.items
    .filter((i) => i.horizon === period && (i.status === "active" || i.status === "done"))
    .filter((i) => {
      // items from before anchoring existed have no instance — keep the old
      // rule so nothing old silently disappears: show them in whatever
      // instance is current right now
      if (!i.horizonPeriod) return isCurrent;
      // period keys sort chronologically as strings (2026-07 < 2026-08,
      // 2026-Q2 < 2026-Q3, 2026-W28 < 2026-W29, 2026 < 2027)
      const ik = periodKey(period, i.horizonPeriod);
      if (ik === key) return true; // belongs to this very instance
      // carry forward, but only into the instance that's live right now (past
      // instances keep just their own): an unfinished goal follows you into
      // this month/week/quarter/year, and one you finished here stays visible
      // here too until the instance turns over — the same grace daily tasks get
      if (!isCurrent || ik >= key) return false;
      if (i.status === "active") return true;
      return i.completedAt != null && periodKey(period, dayFromMs(i.completedAt)) === key;
    })
    .sort((a, b) => doneRank(a) - doneRank(b) || a.position - b.position);
}

/** Is this item showing in `anchor`'s list only because it carried over from an
 *  earlier, unfinished instance? If so, returns that origin instance's anchor
 *  day (for a "carried from July" caption); otherwise null. */
export function carriedHorizonFrom(item: Item, period: Period, anchor: string): string | null {
  if (!item.horizonPeriod) return null;
  return periodKey(period, item.horizonPeriod) !== periodKey(period, anchor) ? item.horizonPeriod : null;
}

export function ancestors(db: DB, item: Item): Item[] {
  const out: Item[] = [];
  let cur = item;
  const seen = new Set<string>([item.id]);
  while (cur.parentId) {
    const p = db.items.find((i) => i.id === cur.parentId);
    if (!p || seen.has(p.id)) break;
    out.push(p);
    seen.add(p.id);
    cur = p;
  }
  return out;
}

export function descendants(db: DB, itemId: string): Item[] {
  const out: Item[] = [];
  const queue = [itemId];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    for (const kid of db.items.filter((i) => i.parentId === id)) {
      if (seen.has(kid.id)) continue;
      seen.add(kid.id);
      out.push(kid);
      queue.push(kid.id);
    }
  }
  return out;
}

/* ————— Habits, schedules & streaks ————— */

/** Days on which the habit counts as done — a day with a daily amount target
 *  (drink 3L water) only counts once the full amount is logged. */
export function habitDays(logs: Log[], itemId: string, dailyTarget = 1): Set<string> {
  const perDay = new Map<string, number>();
  for (const l of logs) {
    if (l.itemId === itemId && l.op === "add") {
      perDay.set(l.date, (perDay.get(l.date) ?? 0) + l.value);
    }
  }
  return new Set([...perDay].filter(([, v]) => v >= dailyTarget).map(([d]) => d));
}

export function habitDailyTarget(item: Item): number {
  return item.tracker === "habit" && item.target && item.target > 1 ? item.target : 1;
}

/** Units logged on one day (for "2 of 3 glasses" style habits). */
export function dayLogged(logs: Log[], itemId: string, day: string): number {
  return logs
    .filter((l) => l.itemId === itemId && l.date === day && l.op === "add")
    .reduce((s, l) => s + l.value, 0);
}

/** Distinct days with progress in the (Monday-start) week containing `day`. */
export function weekLoggedDays(logs: Log[], itemId: string, day: string): number {
  const start = startOfWeek(day);
  const end = addDays(start, 6);
  return new Set(
    logs
      .filter((l) => l.itemId === itemId && l.value > 0 && l.date >= start && l.date <= end)
      .map((l) => l.date)
  ).size;
}

function monthLoggedDays(logs: Log[], itemId: string, day: string): number {
  const month = day.slice(0, 7);
  return new Set(
    logs
      .filter((l) => l.itemId === itemId && l.value > 0 && l.date.startsWith(month))
      .map((l) => l.date)
  ).size;
}

/** Habits and routines default to daily; anything else needs an explicit schedule. */
export function effectiveCadence(item: Item): Cadence {
  return item.cadence ?? (item.kind === "habit" || item.kind === "routine" ? "daily" : null);
}

/** Total expected length of a routine — the sum of its steps' minutes.
 *  Null when nothing is timed yet, so callers can fall back to a default. */
export function routineMinutes(item: Item): number | null {
  if (!item.steps || item.steps.length === 0) return null;
  const total = item.steps.reduce((sum, s) => sum + (s.minutes ?? 0), 0);
  return total > 0 ? total : null;
}

/** "HH:MM" → minutes since midnight, or null for anything malformed. */
export function parseHM(s: string | null): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h >= 0 && h <= 23 && min >= 0 && min <= 59 ? h * 60 + min : null;
}

/** "21:00" → "9:00 pm" — how times read everywhere in the app. */
export function fmtHM(s: string): string {
  const total = parseHM(s);
  if (total == null) return s;
  const h24 = Math.floor(total / 60);
  const min = total % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${min.toString().padStart(2, "0")} ${h24 < 12 ? "am" : "pm"}`;
}

/** Is this routine inside its visible hours right now? No window (or a
 *  half-set one) means always. An end before the start wraps past midnight:
 *  21:00 → 02:00 is visible late evening AND the small hours. */
export function inRoutineWindow(item: Item, now: Date): boolean {
  const start = parseHM(item.windowStart);
  const end = parseHM(item.windowEnd);
  if (start == null || end == null || start === end) return true;
  const t = now.getHours() * 60 + now.getMinutes();
  return start < end ? t >= start && t < end : t >= start || t < end;
}

/** How late "tonight" stretches: the calendar flips at midnight, but the
 *  person doesn't — before 4 am they're still living the previous evening. */
const NIGHT_SPILL_MINUTES = 4 * 60;

/** Which day a routine's ticks, steps and streak belong to right now.
 *  A routine whose visible hours wrap past midnight (21:00 → 02:00) belongs
 *  to the evening it started: until its window ends — or until 4 am,
 *  whichever is later — everything logs to the previous calendar day, so
 *  finishing the night routine at 1 am doesn't leak into tomorrow. Routines
 *  without a wrapped window use the calendar day unchanged. */
export function routineLogDay(item: Item, now = new Date()): string {
  const start = parseHM(item.windowStart);
  const end = parseHM(item.windowEnd);
  const wrapped = item.kind === "routine" && start != null && end != null && end < start;
  const day = toDay(now);
  if (!wrapped) return day;
  const t = now.getHours() * 60 + now.getMinutes();
  return t < Math.max(end, NIGHT_SPILL_MINUTES) ? addDays(day, -1) : day;
}

/** "6:00 am – 12:00 pm", or null when the routine shows all day. */
export function routineWindowLabel(item: Item): string | null {
  if (parseHM(item.windowStart) == null || parseHM(item.windowEnd) == null) return null;
  return `${fmtHM(item.windowStart!)} – ${fmtHM(item.windowEnd!)}`;
}

/** Which of a routine's steps are already done on `day`. */
export function routineDoneSteps(db: DB, itemId: string, day: string): Set<string> {
  const note = db.habitDayNotes.find((n) => n.itemId === itemId && n.date === day);
  return new Set(note?.doneSteps ?? []);
}

const CURRENCY_UNITS = ["₹", "$", "€", "£"];

/** "1240 ₹" reads wrong and "3kg" reads cramped — currency prefixes, words suffix. */
export function formatEntryAmount(amount: number, unit: string | null): string {
  if (!unit) return amount.toLocaleString();
  return CURRENCY_UNITS.includes(unit)
    ? `${unit}${amount.toLocaleString()}`
    : `${amount.toLocaleString()} ${unit}`;
}

/** Per-unit sums of a list's amounts: "₹1,240 · 3 kg". Only entries carrying
 *  both an amount and a unit count; done entries still count — the total is
 *  what the list adds up to, and shouldn't dance as things get ticked.
 *  Null when nothing is quantified. */
export function listTotals(entries: ListEntry[]): string | null {
  const sums = new Map<string, number>();
  for (const e of entries) {
    if (e.amount != null && e.unit) {
      sums.set(e.unit, (sums.get(e.unit) ?? 0) + e.amount);
    }
  }
  if (sums.size === 0) return null;
  return [...sums]
    .map(([unit, sum]) =>
      CURRENCY_UNITS.includes(unit) ? `${unit}${sum.toLocaleString()}` : `${sum.toLocaleString()} ${unit}`
    )
    .join(" · ");
}

const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function scheduleLabel(item: Item): string | null {
  const c = effectiveCadence(item);
  if (!c) return null;
  switch (c) {
    case "daily":
      return "every day";
    case "weekdays":
      return "weekdays";
    case "days": {
      const days = [...(item.cadenceDays ?? [])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      return days.length ? days.map((d) => DOW_SHORT[d]).join(" · ") : "specific days";
    }
    case "weekly":
      return `${item.cadenceCount ?? 1}× a week`;
    case "monthly":
      return "monthly";
  }
}

export function currentStreak(days: Set<string>, anchor = today()): number {
  let streak = 0;
  let d = anchor;
  // today not logged yet doesn't break the streak
  if (!days.has(d)) d = addDays(d, -1);
  while (days.has(d)) {
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}

export function bestStreak(days: Set<string>): number {
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/* ————— Today ————— */

export interface TodayEntry {
  /** real action row, or a virtual one generated by an item's schedule */
  action: Action;
  item: Item | null;
  /** true when generated by a schedule — completing writes log events */
  virtualHabit: boolean;
  /** true when generated by a nested item's "today" horizon — completing
   *  it retires the item itself, same as "Mark complete" on its own page */
  virtualItemTask: boolean;
  /** action carried forward from an earlier day */
  carriedFrom: string | null;
  /** for an action shown on its own planned day: the day it actually got
   *  done, when that's a later day — carrying it forward never erases it
   *  from where it was meant to happen */
  completedOn: string | null;
  /** units logged today vs the daily amount (3L water → 2/3) */
  dayValue: number;
  dayTarget: number;
  /** human schedule caption: "Mon · Wed · Fri", "4× a week (2 done)" … */
  scheduleLabel: string | null;
}

interface ScheduledState {
  due: boolean;
  done: boolean;
  dayValue: number;
  dayTarget: number;
  label: string | null;
}

/** Should this item appear on Today, and how far along is it? */
export function scheduledState(item: Item, logs: Log[], day: string): ScheduledState | null {
  if (item.status !== "active") return null;
  const cadence = effectiveCadence(item);
  if (!cadence) return null;

  const dow = new Date(day + "T12:00:00").getDay();
  const dayTarget = habitDailyTarget(item);
  const dayValue = dayLogged(logs, item.id, day);
  const done = dayValue >= dayTarget;
  let label = scheduleLabel(item);
  let due: boolean;

  switch (cadence) {
    case "daily":
      due = true;
      break;
    case "weekdays":
      due = dow >= 1 && dow <= 5;
      break;
    case "days":
      due = (item.cadenceDays ?? []).includes(dow);
      break;
    case "weekly": {
      const target = item.cadenceCount ?? 1;
      const doneThisWeek = weekLoggedDays(logs, item.id, day);
      // keep showing until the week's quota is met; stay visible when done today
      due = doneThisWeek < target || dayValue > 0;
      label = `${target}× a week · ${Math.min(doneThisWeek, target)} done`;
      break;
    }
    case "monthly":
      due = monthLoggedDays(logs, item.id, day) === 0 || dayValue > 0;
      break;
  }

  return { due, done, dayValue, dayTarget, label };
}

export function todayEntries(db: DB, day = today(), includeCarried = day === today()): TodayEntry[] {
  const entries: TodayEntry[] = [];

  // 1. real actions for the day — a task never leaves the day it was
  //    planned for, even once carrying it forward finishes it somewhere else
  for (const a of db.actions.filter((a) => a.date === day)) {
    entries.push({
      action: a,
      item: a.itemId ? db.items.find((i) => i.id === a.itemId) ?? null : null,
      virtualHabit: false,
      virtualItemTask: false,
      carriedFrom: null,
      completedOn: a.done && a.doneAt != null && dayFromMs(a.doneAt) !== day ? dayFromMs(a.doneAt) : null,
      dayValue: a.done ? 1 : 0,
      dayTarget: 1,
      scheduleLabel: null,
    });
  }

  // 2. actions from earlier days that are either still open, or were finished
  //    on the day being viewed right now — carried forward, never shamed
  //    (only on the real today; browsing other days shows just that day).
  //    Finishing one here doesn't erase it: it just stops carrying past the
  //    day it actually got done.
  for (const a of includeCarried
    ? db.actions.filter((a) => a.date < day && (!a.done || (a.doneAt != null && dayFromMs(a.doneAt) === day)))
    : []
  ) {
    entries.push({
      action: a,
      item: a.itemId ? db.items.find((i) => i.id === a.itemId) ?? null : null,
      virtualHabit: false,
      virtualItemTask: false,
      carriedFrom: a.date,
      completedOn: null,
      dayValue: a.done ? 1 : 0,
      dayTarget: 1,
      scheduleLabel: null,
    });
  }

  // 3. scheduled items (habits and anything with a cadence) — virtual rows
  for (const item of db.items) {
    // a night routine straddling midnight still belongs to yesterday until
    // ~4 am: its row reads and writes that day, not the calendar one
    const d = day === today() ? routineLogDay(item) : day;
    const state = scheduledState(item, db.logs, d);
    if (!state || !state.due) continue;
    const hasRealAction = entries.some((e) => e.action.itemId === item.id);
    if (hasRealAction) continue;
    // what this specific day means for this habit, e.g. "clean" → "clean desk"
    const dayNote = db.habitDayNotes.find((n) => n.itemId === item.id && n.date === d);
    entries.push({
      action: {
        id: `habit:${item.id}:${d}`,
        itemId: item.id,
        title: item.title,
        date: d,
        done: state.done,
        doneAt: null,
        amount: 1,
        priority: 0,
        note: dayNote?.text ?? "",
        createdAt: item.createdAt,
      },
      item,
      virtualHabit: true,
      virtualItemTask: false,
      carriedFrom: null,
      completedOn: null,
      dayValue: state.dayValue,
      dayTarget: state.dayTarget,
      scheduleLabel: state.label,
    });
  }

  // 4. items whose planning horizon is "today" — a standing "do this today"
  //    marker on any nested node, with no cadence of its own. Completing it
  //    retires the item, same as "Mark complete" on its own page, so progress
  //    flows straight into the parent's percentage.
  if (day === today()) {
    for (const item of db.items) {
      // an explicit "today" horizon, or a period goal pulled onto Today from
      // its week/month/quarter/year list (which keeps its own horizon)
      if (item.horizon !== "today" && !item.pulledToday) continue;
      if (effectiveCadence(item) !== null) continue; // already covered above
      const doneToday = item.status === "done" && item.completedAt != null && dayFromMs(item.completedAt) === day;
      if (item.status !== "active" && !doneToday) continue;
      if (entries.some((e) => e.action.itemId === item.id)) continue;
      entries.push({
        action: {
          id: `today-item:${item.id}`,
          itemId: item.id,
          title: item.title,
          date: day,
          done: doneToday,
          doneAt: item.completedAt,
          amount: 1,
          priority: 0,
          note: "",
          createdAt: item.createdAt,
        },
        item,
        virtualHabit: false,
        virtualItemTask: true,
        carriedFrom: null,
        completedOn: null,
        dayValue: doneToday ? 1 : 0,
        dayTarget: 1,
        scheduleLabel: null,
      });
    }
  }

  // 5. items pinned to an exact calendar date — a one-off appointment, or
  //    an annual one like a birthday (dateRepeatsYearly). Unlike #4, this
  //    isn't gated to the real today: browsing ahead to the pinned day
  //    should reveal it, the whole point of picking a date in advance.
  for (const item of db.items) {
    if (item.horizon !== "date" || !item.horizonPeriod) continue;
    const matches = item.dateRepeatsYearly
      ? item.horizonPeriod.slice(5) === day.slice(5)
      : item.horizonPeriod === day;
    if (!matches) continue;
    if (entries.some((e) => e.action.itemId === item.id)) continue;

    if (item.dateRepeatsYearly) {
      // recurring: logged per-occurrence like a habit, so it resets on its
      // own next year instead of "Mark complete" retiring it for good
      if (item.status !== "active") continue;
      const dayValue = dayLogged(db.logs, item.id, day);
      entries.push({
        action: {
          id: `date:${item.id}:${day}`, itemId: item.id, title: item.title, date: day,
          done: dayValue > 0, doneAt: null, amount: 1, priority: 0, note: "", createdAt: item.createdAt,
        },
        item, virtualHabit: true, virtualItemTask: false, carriedFrom: null, completedOn: null,
        dayValue, dayTarget: 1, scheduleLabel: "every year",
      });
    } else {
      const doneToday = item.status === "done" && item.completedAt != null && dayFromMs(item.completedAt) === day;
      if (item.status !== "active" && !doneToday) continue;
      entries.push({
        action: {
          id: `date-item:${item.id}`, itemId: item.id, title: item.title, date: day,
          done: doneToday, doneAt: item.completedAt, amount: 1, priority: 0, note: "", createdAt: item.createdAt,
        },
        item, virtualHabit: false, virtualItemTask: true, carriedFrom: null, completedOn: null,
        dayValue: doneToday ? 1 : 0, dayTarget: 1, scheduleLabel: null,
      });
    }
  }

  // completing a task never moves it — position only changes by dragging,
  // or by the explicit "Sort" tidy-up, both of which persist here
  const manualOrder = db.dayOrder.find((o) => o.date === day)?.order;
  return entries.sort((a, b) => {
    const pa = manualOrder ? manualOrder.indexOf(a.action.id) : -1;
    const pb = manualOrder ? manualOrder.indexOf(b.action.id) : -1;
    const ra = pa === -1 ? Infinity : pa;
    const rb = pb === -1 ? Infinity : pb;
    if (ra !== rb) return ra - rb;
    if (a.action.priority !== b.action.priority) return b.action.priority - a.action.priority;
    return a.action.createdAt - b.action.createdAt;
  });
}

/** The "tidy up" order: undone first, done last — same shape Today used to
 *  auto-apply on every toggle. Used only by the explicit Sort button. */
export function sortedByDone(entries: TodayEntry[]): TodayEntry[] {
  return [...entries].sort((a, b) => {
    if (a.action.done !== b.action.done) return a.action.done ? 1 : -1;
    if (a.action.priority !== b.action.priority) return b.action.priority - a.action.priority;
    return a.action.createdAt - b.action.createdAt;
  });
}

/* ————— Aggregates for reviews & dashboards ————— */

export function completionsInRange(db: DB, start: string, end: string) {
  const doneActions = db.actions.filter((a) => a.done && a.date >= start && a.date <= end);
  const habitLogs = db.logs.filter((l) => l.date >= start && l.date <= end && l.value > 0);
  const planned = db.actions.filter((a) => a.date >= start && a.date <= end);
  return { doneActions, habitLogs, planned };
}

export function areaOfItem(db: DB, item: Item | null): string | null {
  let cur = item;
  const seen = new Set<string>();
  while (cur) {
    if (cur.areaId) return cur.areaId;
    if (!cur.parentId || seen.has(cur.parentId)) return null;
    seen.add(cur.parentId);
    cur = db.items.find((i) => i.id === cur!.parentId) ?? null;
  }
  return null;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function formatValue(item: Item, v: number): string {
  const unit = item.unit ?? "";
  if (item.tracker === "money") {
    return `${unit || "₹"}${v.toLocaleString()}`;
  }
  if (item.tracker === "percent") return `${Math.round(v)}%`;
  return unit ? `${v.toLocaleString()} ${unit}` : v.toLocaleString();
}

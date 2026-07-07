import { Action, Cadence, DB, Item, Log } from "./types";
import { addDays, daysBetween, startOfWeek, today } from "./dates";

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
  const own = ownProgress(item);
  if (own !== null) return own;
  if (depth > 12) return null; // guard against pathological cycles
  const kids = children(db, item.id);
  const kidVals = kids
    .map((k) => itemProgress(db, k, depth + 1))
    .filter((v): v is number => v !== null);
  if (kidVals.length === 0) return item.status === "done" ? 1 : null;
  return kidVals.reduce((a, b) => a + b, 0) / kidVals.length;
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

/** Habits default to daily; anything else needs an explicit schedule. */
export function effectiveCadence(item: Item): Cadence {
  return item.cadence ?? (item.kind === "habit" ? "daily" : null);
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
  /** action carried forward from an earlier day */
  carriedFrom: string | null;
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

  // 1. real actions for the day
  for (const a of db.actions.filter((a) => a.date === day)) {
    entries.push({
      action: a,
      item: a.itemId ? db.items.find((i) => i.id === a.itemId) ?? null : null,
      virtualHabit: false,
      carriedFrom: null,
      dayValue: a.done ? 1 : 0,
      dayTarget: 1,
      scheduleLabel: null,
    });
  }

  // 2. unfinished actions from earlier days — carried forward, never shamed
  //    (only on the real today; browsing other days shows just that day)
  for (const a of includeCarried ? db.actions.filter((a) => !a.done && a.date < day) : []) {
    entries.push({
      action: a,
      item: a.itemId ? db.items.find((i) => i.id === a.itemId) ?? null : null,
      virtualHabit: false,
      carriedFrom: a.date,
      dayValue: 0,
      dayTarget: 1,
      scheduleLabel: null,
    });
  }

  // 3. scheduled items (habits and anything with a cadence) — virtual rows
  for (const item of db.items) {
    const state = scheduledState(item, db.logs, day);
    if (!state || !state.due) continue;
    const hasRealAction = entries.some((e) => e.action.itemId === item.id);
    if (hasRealAction) continue;
    entries.push({
      action: {
        id: `habit:${item.id}:${day}`,
        itemId: item.id,
        title: item.title,
        date: day,
        done: state.done,
        doneAt: null,
        amount: 1,
        priority: 0,
        note: "",
        createdAt: item.createdAt,
      },
      item,
      virtualHabit: true,
      carriedFrom: null,
      dayValue: state.dayValue,
      dayTarget: state.dayTarget,
      scheduleLabel: state.label,
    });
  }

  return entries.sort((a, b) => {
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

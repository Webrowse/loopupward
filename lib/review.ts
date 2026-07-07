import { DB, Item } from "./types";
import { Period, periodRange, previousAnchor } from "./dates";
import { areaOfItem, bestStreak, completionsInRange, habitDailyTarget, habitDays } from "./progress";

export interface AreaScore {
  areaId: string | null;
  done: number;
  planned: number;
  rate: number;
}

export interface HabitScore {
  item: Item;
  daysDone: number;
  daysPossible: number;
  bestStreak: number;
}

export interface TrackerDelta {
  item: Item;
  /** units added during the period (add-op logs) */
  added: number;
  /** for set-op trackers (money, percent): start → end values */
  startValue: number | null;
  endValue: number | null;
}

export interface ReviewData {
  period: Period;
  start: string;
  end: string;
  planned: number;
  completed: number;
  consistency: number; // 0..1, includes habit days
  areaScores: AreaScore[];
  strongest: AreaScore | null;
  needsAttention: AreaScore | null;
  habits: HabitScore[];
  trackers: TrackerDelta[];
  booksFinished: Item[];
  goalsCompleted: Item[];
  previous: {
    completed: number;
    consistency: number;
    habitDays: Record<string, number>; // itemId -> days done
    trackerAdded: Record<string, number>; // itemId -> units added
  };
}

function daysInRangeUpTo(start: string, end: string, todayStr: string): number {
  const cap = end < todayStr ? end : todayStr;
  if (cap < start) return 0;
  const a = new Date(start + "T12:00:00").getTime();
  const b = new Date(cap + "T12:00:00").getTime();
  return Math.round((b - a) / 86400000) + 1;
}

export function computeReview(db: DB, period: Period, anchor: string, todayStr: string): ReviewData {
  const { start, end } = periodRange(period, anchor);
  const prev = periodRange(period, previousAnchor(period, anchor));

  const cur = completionsInRange(db, start, end);
  const prevC = completionsInRange(db, prev.start, prev.end);

  /* per-area completion */
  const areaMap = new Map<string | null, { done: number; planned: number }>();
  const bump = (areaId: string | null, done: boolean) => {
    const rec = areaMap.get(areaId) ?? { done: 0, planned: 0 };
    rec.planned++;
    if (done) rec.done++;
    areaMap.set(areaId, rec);
  };
  for (const a of cur.planned) {
    const item = a.itemId ? db.items.find((i) => i.id === a.itemId) ?? null : null;
    bump(areaOfItem(db, item), a.done);
  }

  /* habits */
  const habitItems = db.items.filter((i) => i.kind === "habit" && i.status !== "archived");
  const possible = daysInRangeUpTo(start, end, todayStr);
  const habits: HabitScore[] = habitItems.map((h) => {
    const all = habitDays(db.logs, h.id, habitDailyTarget(h));
    const inRange = [...all].filter((d) => d >= start && d <= end);
    // habits count toward their area's score too
    const areaId = areaOfItem(db, h);
    const rec = areaMap.get(areaId) ?? { done: 0, planned: 0 };
    rec.planned += possible;
    rec.done += inRange.length;
    areaMap.set(areaId, rec);
    return { item: h, daysDone: inRange.length, daysPossible: possible, bestStreak: bestStreak(all) };
  });

  const areaScores: AreaScore[] = [...areaMap.entries()]
    .map(([areaId, r]) => ({ areaId, ...r, rate: r.planned ? r.done / r.planned : 0 }))
    .filter((s) => s.planned > 0)
    .sort((a, b) => b.rate - a.rate);

  /* trackers: units added + start/end snapshots */
  const trackerItems = db.items.filter(
    (i) => ["counter", "book", "money", "percent"].includes(i.tracker) && i.status !== "archived"
  );
  const trackers: TrackerDelta[] = trackerItems
    .map((item) => {
      const logs = db.logs
        .filter((l) => l.itemId === item.id)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt));
      const added = logs
        .filter((l) => l.op === "add" && l.date >= start && l.date <= end)
        .reduce((s, l) => s + l.value, 0);
      let startValue: number | null = null;
      let endValue: number | null = null;
      if (item.tracker === "money" || item.tracker === "percent") {
        const before = logs.filter((l) => l.op === "set" && l.date < start);
        const inRange = logs.filter((l) => l.op === "set" && l.date <= end);
        startValue = before.length ? before[before.length - 1].value : null;
        endValue = inRange.length ? inRange[inRange.length - 1].value : null;
      }
      return { item, added, startValue, endValue };
    })
    .filter((t) => t.added !== 0 || (t.endValue !== null && t.endValue !== t.startValue));

  /* completions */
  const inRangeDone = (i: Item) => {
    if (!i.completedAt) return false;
    const d = new Date(i.completedAt);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return day >= start && day <= end;
  };
  const booksFinished = db.items.filter((i) => i.kind === "book" && inRangeDone(i));
  const goalsCompleted = db.items.filter(
    (i) => ["goal", "project", "milestone"].includes(i.kind) && inRangeDone(i)
  );

  /* consistency = (done actions + habit days) / (planned actions + possible habit days) */
  const habitDone = habits.reduce((s, h) => s + h.daysDone, 0);
  const habitPossible = habits.reduce((s, h) => s + h.daysPossible, 0);
  const planned = cur.planned.length + habitPossible;
  const completed = cur.planned.filter((a) => a.done).length + habitDone;
  const consistency = planned ? completed / planned : 0;

  /* previous period comparisons */
  const prevPossible = daysInRangeUpTo(prev.start, prev.end, todayStr);
  const prevHabitDays: Record<string, number> = {};
  let prevHabitDone = 0;
  for (const h of habitItems) {
    const n = db.logs.filter(
      (l) => l.itemId === h.id && l.value > 0 && l.date >= prev.start && l.date <= prev.end
    ).length;
    prevHabitDays[h.id] = n;
    prevHabitDone += n;
  }
  const prevTrackerAdded: Record<string, number> = {};
  for (const t of trackerItems) {
    prevTrackerAdded[t.id] = db.logs
      .filter((l) => l.itemId === t.id && l.op === "add" && l.date >= prev.start && l.date <= prev.end)
      .reduce((s, l) => s + l.value, 0);
  }
  const prevPlanned = prevC.planned.length + habitItems.length * prevPossible;
  const prevCompleted = prevC.planned.filter((a) => a.done).length + prevHabitDone;

  return {
    period, start, end, planned, completed, consistency,
    areaScores,
    strongest: areaScores[0] ?? null,
    needsAttention: areaScores.length > 1 ? areaScores[areaScores.length - 1] : null,
    habits: habits.sort((a, b) => b.daysDone - a.daysDone),
    trackers,
    booksFinished,
    goalsCompleted,
    previous: {
      completed: prevCompleted,
      consistency: prevPlanned ? prevCompleted / prevPlanned : 0,
      habitDays: prevHabitDays,
      trackerAdded: prevTrackerAdded,
    },
  };
}
